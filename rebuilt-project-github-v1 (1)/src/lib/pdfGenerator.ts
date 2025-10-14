import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { supabase } from '../services/supabase';
import { Invoice, Quote, Visit } from '../types';
import { translations } from '../constants';
import { formatEuropeanDate, formatEuropeanTime } from './formatting';

// Define a consistent footer height to reserve space at the bottom of each page.
const FOOTER_HEIGHT = 20;
const PAGE_MARGIN = 15;

// Helper to fetch and convert image to base64
const getBase64ImageFromUrl = async (imageUrl: string): Promise<string | null> => {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) return null;
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("Error fetching or converting image:", error);
        return null;
    }
};

const addFooters = (doc: jsPDF, org: any, lang: 'de' | 'al') => {
    const t = (key: any) => translations[lang][key] || key;
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);

        const footerParts = [];
        if (org.company_name || org.name) footerParts.push(org.company_name || org.name);
        if (org.address) footerParts.push(org.address.replace(/\n/g, ', '));
        if (org.iban) footerParts.push(`IBAN: ${org.iban}`);
        if (org.bic) footerParts.push(`BIC: ${org.bic}`);
        
        const footerText = footerParts.join(' | ');

        // Draw a line above the footer
        doc.setDrawColor(150); // a light grey
        doc.line(PAGE_MARGIN, doc.internal.pageSize.height - 18, doc.internal.pageSize.width - PAGE_MARGIN, doc.internal.pageSize.height - 18);

        doc.text(footerText, PAGE_MARGIN, doc.internal.pageSize.height - 12);
        
        doc.text(`${t('page')} ${i} / ${pageCount}`, doc.internal.pageSize.width - PAGE_MARGIN, doc.internal.pageSize.height - 12, { align: 'right' });
    }
};

/**
 * A robust function to draw a block of text with manual page-breaking to avoid overlaps.
 * @param doc The jsPDF instance.
 * @param text The text content to draw.
 * @param x The starting X coordinate.
 * @param y The starting Y coordinate.
 * @param width The maximum width of the text block.
 * @param options Styling options for the text.
 * @returns The final Y position after drawing the text.
 */
const drawTextBox = (doc: jsPDF, text: string, x: number, y: number, width: number, options: { fontSize: number; fontStyle: 'normal' | 'bold' }): number => {
    const { fontSize, fontStyle } = options;
    doc.setFontSize(fontSize).setFont(undefined, fontStyle);

    const lines = doc.splitTextToSize(text, width);
    const lineHeight = doc.getLineHeight() / doc.internal.scaleFactor;
    const pageHeight = doc.internal.pageSize.getHeight();
    
    let currentY = y;

    for (const line of lines) {
        if (currentY + lineHeight > pageHeight - FOOTER_HEIGHT) {
            doc.addPage();
            currentY = PAGE_MARGIN;
        }
        doc.text(line, x, currentY);
        currentY += lineHeight;
    }
    
    return currentY;
};


export const generateDocumentPDF = async (
    documentId: number, 
    documentType: 'invoice' | 'quote', 
    language: 'de' | 'al' = 'de',
    outputType: 'download' | 'blob' = 'download'
): Promise<void | Blob> => {
    const t = (key: any) => translations[language][key] || translations['de'][key as any] || key;
    const tableName = documentType === 'invoice' ? 'invoices' : 'quotes';
    const itemsTableName = documentType === 'invoice' ? 'invoice_items' : 'quote_items';
    const numberProp = documentType === 'invoice' ? 'invoice_number' : 'quote_number';
    const dateProp = 'issue_date';
    
    const { data: docData, error } = await supabase
        .from(tableName)
        .select(`
            *, 
            customers:customers!inner(*), 
            organizations:organizations!inner(*), 
            ${itemsTableName}(*, products(id, type, unit))
        `)
        .eq('id', documentId)
        .single();

    if (error || !docData) {
        throw new Error(`Could not fetch ${documentType}: ${error?.message || 'Not found'}`);
    }

    const doc = new jsPDF();
    const org = docData.organizations;
    const customer = docData.customers;
    const items = docData[itemsTableName] || [];
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    let y = PAGE_MARGIN;

    // 1. Logo and Header
    if (org.logo_url) {
        const logoBase64 = await getBase64ImageFromUrl(org.logo_url);
        if (logoBase64) {
            doc.addImage(logoBase64, 'PNG', PAGE_MARGIN, y, 40, 20, undefined, 'FAST');
        }
    }
    
    let headerY = 20;
    doc.setFontSize(10);
    doc.text(org.company_name || org.name, pageWidth - PAGE_MARGIN, headerY, { align: 'right'});
    if(org.address) {
        const addressLines = String(org.address).split('\n');
        addressLines.forEach((line: string) => { headerY+= 5; doc.text(line, pageWidth - PAGE_MARGIN, headerY, { align: 'right'}); });
    }
    headerY += 5;
    if (org.phone) { headerY += 5; doc.text(`${t('phone')}: ${org.phone}`, pageWidth - PAGE_MARGIN, headerY, { align: 'right'}); }
    if (org.email) { headerY += 5; doc.text(`${t('email')}: ${org.email}`, pageWidth - PAGE_MARGIN, headerY, { align: 'right'}); }

    y = 60;
    
    // 2. Customer Address
    doc.setFontSize(10);
    doc.text(customer.name, PAGE_MARGIN, y);
    y += 5;
    if (customer.address) {
        const addressLines = String(customer.address).split('\n');
        addressLines.forEach((line: string) => { doc.text(line, PAGE_MARGIN, y); y += 5; });
    }
    
    // 3. Document Details
    let detailsY = 80;
    doc.setFontSize(14).setFont(undefined, 'bold');
    const docTitle = `${t(documentType)} #${docData[numberProp]}`;
    doc.text(docTitle, PAGE_MARGIN, detailsY);
    
    detailsY += 10;
    doc.setFontSize(10).setFont(undefined, 'normal');
    doc.text(`${t(dateProp)}: ${formatEuropeanDate(docData[dateProp])}`, pageWidth - PAGE_MARGIN, detailsY, { align: 'right' });
    if (documentType === 'invoice') {
        doc.text(`${t('due_date')}: ${formatEuropeanDate((docData as Invoice).due_date)}`, pageWidth - PAGE_MARGIN, detailsY + 5, { align: 'right' });
    } else {
        doc.text(`${t('valid_until')}: ${formatEuropeanDate((docData as Quote).valid_until_date)}`, pageWidth - PAGE_MARGIN, detailsY + 5, { align: 'right' });
    }
    doc.text(`${t('customer_number')}: ${customer.customer_number}`, PAGE_MARGIN, detailsY);

    y = detailsY + 15;

    const customerNotes = (docData as Invoice | Quote).customer_notes;
    if (customerNotes) {
        y += 5;
        doc.setFontSize(10).setFont(undefined, 'bold');
        if (y + 10 > pageHeight - FOOTER_HEIGHT) { doc.addPage(); y = PAGE_MARGIN; }
        doc.text(t('notes'), PAGE_MARGIN, y);
        y += 5;

        y = drawTextBox(doc, customerNotes, PAGE_MARGIN, y, pageWidth - (PAGE_MARGIN * 2), { fontSize: 10, fontStyle: 'normal' });
    }

    const head = [[t('position'), t('description'), t('quantity'), t('unitPrice'), `MwSt./VAT %`, t('total')]];
    const body = items.map((item: any, index: number) => {
        const itemTotal = item.quantity * item.unit_price;
        const vatAmount = itemTotal * (item.vat_rate / 100);
        const totalWithVat = itemTotal + vatAmount;

        let descriptionContent = item.description;
        const styles: { fontStyle?: 'italic' } = {};

        if (item.products && item.products.type === 'service') {
            styles.fontStyle = 'italic';
            if (item.products.unit) {
                descriptionContent = `${item.description} (${item.products.unit})`;
            }
        }
        
        const descriptionCell = Object.keys(styles).length > 0 
            ? { content: descriptionContent, styles } 
            : descriptionContent;

        return [
            index + 1,
            descriptionCell,
            item.quantity,
            `€${item.unit_price.toFixed(2)}`,
            `${item.vat_rate}%`,
            `€${totalWithVat.toFixed(2)}`
        ];
    });

    autoTable(doc, {
        startY: y + 10,
        head: head,
        body: body,
        theme: 'grid',
        headStyles: { fillColor: [47, 55, 69], textColor: 255 },
        columnStyles: {
            0: { halign: 'center', cellWidth: 15 },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' },
        },
        marginBottom: FOOTER_HEIGHT,
    });
    
    y = (doc as any).lastAutoTable.finalY;

    const invoice = docData as Invoice;
    let subtotal = 0;
    const vatTotals: { [key: number]: number } = {};
    items.forEach((item: any) => {
        const itemTotal = item.quantity * item.unit_price;
        subtotal += itemTotal;
        vatTotals[item.vat_rate] = (vatTotals[item.vat_rate] || 0) + (itemTotal * (item.vat_rate / 100));
    });

    const hasStripeLink = documentType === 'invoice' && invoice.organizations?.is_payment_gateway_enabled && invoice.payment_link_url;
    const hasSepaQr = documentType === 'invoice' && org.iban && org.bic && (org.company_name || org.name);

    const totalsHeight = (2 + Object.keys(vatTotals).length) * 6;
    let paymentHeight = 0;
    if (hasStripeLink) paymentHeight += 15;
    if (hasSepaQr) paymentHeight += 45;
    const requiredHeight = Math.max(totalsHeight, paymentHeight);

    if (y + 10 + requiredHeight > pageHeight - FOOTER_HEIGHT) {
        doc.addPage();
        y = PAGE_MARGIN;
    }
    
    const startY = y + 10;
    
    let totalsY = startY;
    const rightColX = pageWidth / 2 + 10;
    doc.setFontSize(10).setFont(undefined, 'normal');
    doc.text(`${t('subtotal')}:`, rightColX, totalsY);
    doc.text(`€${subtotal.toFixed(2)}`, pageWidth - PAGE_MARGIN, totalsY, { align: 'right' });
    totalsY += 6;
    Object.entries(vatTotals).forEach(([rate, amount]) => {
        doc.text(`+ MwSt./VAT ${rate}%:`, rightColX, totalsY);
        doc.text(`€${amount.toFixed(2)}`, pageWidth - PAGE_MARGIN, totalsY, { align: 'right' });
        totalsY += 6;
    });
    doc.setFontSize(12).setFont(undefined, 'bold');
    doc.text(`${t('total')}:`, rightColX, totalsY);
    doc.text(`€${(docData as Invoice | Quote).total_amount.toFixed(2)}`, pageWidth - PAGE_MARGIN, totalsY, { align: 'right' });

    let paymentY = startY;
    if (hasStripeLink) {
        doc.setFontSize(10).setFont(undefined, 'bold');
        doc.text(t('payOnline'), PAGE_MARGIN, paymentY);
        paymentY += 5;

        doc.setFont(undefined, 'normal');
        doc.setTextColor(0, 0, 255);
        const linkText = 'Click here to pay online';
        doc.textWithLink(linkText, PAGE_MARGIN, paymentY, { url: invoice.payment_link_url! });
        doc.setTextColor(0, 0, 0);
        paymentY += 10;
    }
    
    if (hasSepaQr) {
        const sepaString = [ 'BCD', '002', '1', 'SCT', org.bic, org.company_name || org.name, org.iban.replace(/\s/g, ''), `EUR${invoice.total_amount.toFixed(2)}`, '', '', `Rechnung ${invoice.invoice_number}`, '' ].join('\n');
        try {
            const qrCodeDataUrl = await QRCode.toDataURL(sepaString, { errorCorrectionLevel: 'M', margin: 2, width: 256 });
            doc.addImage(qrCodeDataUrl, 'PNG', PAGE_MARGIN, paymentY, 40, 40);
        } catch (qrError) { console.error("Failed to generate SEPA QR code:", qrError); }
    }
    
    addFooters(doc, org, language);

    if (outputType === 'blob') {
        return doc.output('blob');
    } else {
        doc.save(`${docTitle.replace('#', '')}.pdf`);
    }
};

export const generateVisitSummaryPDF = async (
    visitId: number,
    language: 'de' | 'al' = 'de',
    outputType: 'download' | 'blob' = 'download'
): Promise<void | Blob> => {
    const t = (key: any) => translations[language][key] || key;

    const { data: visitData, error } = await supabase
        .from('visits')
        .select(`*, customers:customers!inner(*), organizations:organizations!inner(*), profiles:assigned_employee_id(*), visit_products:visit_products(*, products!inner(name, product_number, type, unit)), visit_expenses:visit_expenses(*, expenses!inner(description, amount))`)
        .eq('id', visitId)
        .single();
    
    if (error || !visitData) {
        throw new Error(`Could not fetch visit: ${error?.message || 'Not found'}`);
    }

    const doc = new jsPDF();
    const org = visitData.organizations;
    const customer = visitData.customers;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();

    let y = PAGE_MARGIN;

    if (org.logo_url) {
        const logoBase64 = await getBase64ImageFromUrl(org.logo_url);
        if (logoBase64) {
            doc.addImage(logoBase64, 'PNG', PAGE_MARGIN, y, 40, 20, undefined, 'FAST');
        }
    }
    
    let headerY = 20;
    doc.setFontSize(10);
    doc.text(org.company_name || org.name, pageWidth - PAGE_MARGIN, headerY, { align: 'right' });
    if(org.address) {
        const addressLines = String(org.address).split('\n');
        addressLines.forEach((line: string) => { headerY+= 5; doc.text(line, pageWidth - PAGE_MARGIN, headerY, { align: 'right' }); });
    }
    headerY += 5;
    if (org.phone) { headerY += 5; doc.text(`${t('phone')}: ${org.phone}`, pageWidth - PAGE_MARGIN, headerY, { align: 'right' }); }
    if (org.email) { headerY += 5; doc.text(`${t('email')}: ${org.email}`, pageWidth - PAGE_MARGIN, headerY, { align: 'right' }); }

    y = 60;
    
    doc.setFontSize(10);
    doc.text(customer.name, PAGE_MARGIN, y);
    y += 5;
    if (customer.address) {
        const addressLines = String(customer.address).split('\n');
        addressLines.forEach((line: string) => { doc.text(line, PAGE_MARGIN, y); y += 5; });
    }
    
    let detailsY = 80;
    doc.setFontSize(14).setFont(undefined, 'bold');
    doc.text(`${t('einsatzprotokoll')} #${visitData.visit_number}`, PAGE_MARGIN, detailsY);
    
    detailsY += 10;
    doc.setFontSize(10).setFont(undefined, 'normal');
    doc.text(`${t('customer_number')}: ${customer.customer_number}`, PAGE_MARGIN, detailsY);
    doc.text(`${t('date')}: ${formatEuropeanDate(visitData.start_time)}`, pageWidth - PAGE_MARGIN, detailsY, { align: 'right' });
    detailsY += 5;
    doc.text(`${t('location')}: ${visitData.location || ''}`, pageWidth - PAGE_MARGIN, detailsY, { align: 'right' });
    detailsY += 5;
    doc.text(`${t('assignedEmployee')}: ${visitData.profiles?.full_name || 'N/A'}`, pageWidth - PAGE_MARGIN, detailsY, { align: 'right' });

    y = detailsY + 15;

    if (visitData.purpose) {
        doc.setFontSize(10).setFont(undefined, 'bold');
        if (y + 10 > pageHeight - FOOTER_HEIGHT) { doc.addPage(); y = PAGE_MARGIN; }
        doc.text(t('purpose'), PAGE_MARGIN, y);
        y += 5;
        
        y = drawTextBox(doc, visitData.purpose, PAGE_MARGIN, y, pageWidth - PAGE_MARGIN * 2, { fontSize: 10, fontStyle: 'normal' });
    }

    if (visitData.visit_products && visitData.visit_products.length > 0) {
        y += 10;
        doc.setFontSize(10).setFont(undefined, 'bold');
        if (y + 15 > pageHeight - FOOTER_HEIGHT) { doc.addPage(); y = PAGE_MARGIN; }
        doc.text(t('products_used'), PAGE_MARGIN, y);
        
        const productsBody = visitData.visit_products.map((item: any, index: number) => {
            let descriptionContent = item.products?.name || 'N/A';
            const styles: { fontStyle?: 'italic' } = {};

            if (item.products && item.products.type === 'service') {
                styles.fontStyle = 'italic';
                if (item.products.unit) {
                    descriptionContent = `${item.products.name || 'N/A'} (${item.products.unit})`;
                }
            }

            const descriptionCell = Object.keys(styles).length > 0
                ? { content: descriptionContent, styles }
                : descriptionContent;
            
            return [
                index + 1, 
                item.products?.product_number || '', 
                descriptionCell, 
                item.quantity
            ];
        });

        autoTable(doc, {
            startY: y + 5,
            head: [[t('position'), 'Product Number', t('description'), t('quantity')]],
            body: productsBody,
            theme: 'grid', 
            headStyles: { fillColor: [47, 55, 69] }, 
            marginBottom: FOOTER_HEIGHT,
        });
        y = (doc as any).lastAutoTable.finalY;
    }
    
    if (visitData.visit_expenses && visitData.visit_expenses.length > 0) {
        y += 10;
        doc.setFontSize(10).setFont(undefined, 'bold');
        if (y + 15 > pageHeight - FOOTER_HEIGHT) { doc.addPage(); y = PAGE_MARGIN; }
        doc.text(t('expenses_related'), PAGE_MARGIN, y);
        autoTable(doc, {
            startY: y + 5,
            head: [[t('description')]],
            body: visitData.visit_expenses.map((item: any) => [
                item.expenses?.description || 'N/A'
            ]),
            theme: 'grid', 
            headStyles: { fillColor: [47, 55, 69] }, 
            marginBottom: FOOTER_HEIGHT,
        });
        y = (doc as any).lastAutoTable.finalY;
    }

    if (visitData.signature_storage_path) {
        const { data } = await supabase.storage.from('signatures').createSignedUrl(visitData.signature_storage_path, 60);
        if (data?.signedUrl) {
            const signatureBase64 = await getBase64ImageFromUrl(data.signedUrl);
            if (signatureBase64) {
                const signatureBlockHeight = 70;
                if (y + signatureBlockHeight > pageHeight - FOOTER_HEIGHT) {
                    doc.addPage();
                    y = PAGE_MARGIN;
                }
                
                y += 35;
                
                doc.addImage(signatureBase64, 'PNG', PAGE_MARGIN, y - 25, 80, 40);
                doc.line(PAGE_MARGIN, y + 20, PAGE_MARGIN + 80, y + 20);
                
                doc.setFontSize(9).setFont(undefined, 'normal');
                doc.text(t('signature_customer'), PAGE_MARGIN, y + 25);
                
                if (visitData.signature_date) {
                    doc.text(`${t('date')}: ${formatEuropeanDate(visitData.signature_date)}`, PAGE_MARGIN, y + 30);
                }
            }
        }
    }

    addFooters(doc, org, language);

    if (outputType === 'blob') {
        return doc.output('blob');
    } else {
        doc.save(`${t('einsatzprotokoll')}_${visitData.visit_number}.pdf`);
    }
};

export default generateDocumentPDF;
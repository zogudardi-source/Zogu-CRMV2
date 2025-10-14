import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Re-define the ReportData interface here to avoid circular dependencies
// This is a simplified version for the export function's type safety.
interface ReportData {
    kpis: {
        newCustomers: number;
        avgInvoiceValue: number;
        quoteConversionRate: number;
    };
    profitLoss: {
        revenue: number;
        expenses: number;
        profit: number;
    };
    salesByCustomer: { customerName: string; totalSales: number }[];
    taxSummary: {
        collected: number;
    };
    topSellingProducts: { productName: string; totalQuantity: number; totalRevenue: number }[];
    teamPerformance: { employeeName: string; totalRevenue: number; completedVisits: number }[];
}


// Helper function to convert an array of objects to a CSV string.
const jsonToCsv = (items: any[]): string => {
    if (items.length === 0) return '';
    const header = Object.keys(items[0]);
    const headerString = header.join(',');
    const rows = items.map(row => 
        header.map(fieldName => JSON.stringify(row[fieldName], (_, value) => value === null ? '' : value)).join(',')
    );
    return [headerString, ...rows].join('\r\n');
};

/**
 * Triggers a browser download for a CSV file.
 * @param data The array of objects to convert to CSV.
 * @param filename The desired name for the downloaded file.
 */
export const downloadCsv = (data: any[], filename: string) => {
    if (data.length === 0) {
        alert("No data available to export.");
        return;
    }
    const csvData = jsonToCsv(data);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

/**
 * Generates a summary PDF from the report data and triggers a download.
 * @param reportData The fully processed report data object.
 * @param orgName The name of the organization for the report header.
 * @param dateRange An object containing the formatted start and end dates.
 * @param t The translation function.
 */
export const generateReportPdf = (
    reportData: ReportData, 
    orgName: string, 
    dateRange: { start: string, end: string },
    t: (key: any) => string
) => {
    const doc = new jsPDF();
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = margin;

    // Header
    doc.setFontSize(22).setFont(undefined, 'bold');
    doc.text(t('businessReport'), margin, y);
    y += 8;
    doc.setFontSize(12).setFont(undefined, 'normal');
    doc.text(`${orgName}`, margin, y);
    y += 6;
    doc.setFontSize(10);
    doc.text(`${t('period')}: ${dateRange.start} - ${dateRange.end}`, margin, y);
    y += 15;

    // KPIs
    doc.setFontSize(12).setFont(undefined, 'bold');
    doc.text(t('keyPerformanceIndicators'), margin, y);
    y += 7;
    doc.setFontSize(10).setFont(undefined, 'normal');
    doc.text(`- ${t('newCustomers')}: ${reportData.kpis.newCustomers}`, margin, y);
    doc.text(`- ${t('avgInvoiceValue')}: €${reportData.kpis.avgInvoiceValue.toFixed(2)}`, margin + 60, y);
    y += 6;
    doc.text(`- ${t('quoteConversion')}: ${reportData.kpis.quoteConversionRate.toFixed(1)}%`, margin, y);
    y += 12;

    // Profit & Loss
    doc.setFontSize(12).setFont(undefined, 'bold');
    doc.text(t('profitLoss'), margin, y);
    y += 7;
    doc.setFontSize(10);
    autoTable(doc, {
        startY: y,
        theme: 'plain',
        body: [
            [t('totalRevenue'), `€${reportData.profitLoss.revenue.toFixed(2)}`],
            [t('totalExpenses'), `- €${reportData.profitLoss.expenses.toFixed(2)}`],
            [t('netProfit'), `€${reportData.profitLoss.profit.toFixed(2)}`],
        ],
        bodyStyles: { fontStyle: 'bold', cellPadding: 2 },
        columnStyles: { 1: { halign: 'right' } }
    });
    y = (doc as any).lastAutoTable.finalY + 12;

    // Sales by Customer
    if (reportData.salesByCustomer.length > 0) {
        doc.setFontSize(12).setFont(undefined, 'bold');
        doc.text(t('topSalesByCustomer'), margin, y);
        y += 7;
        autoTable(doc, {
            startY: y,
            head: [[t('customer'), t('totalSales')]],
            body: reportData.salesByCustomer
                .sort((a, b) => b.totalSales - a.totalSales)
                .slice(0, 10) // Limit to top 10 for PDF
                .map(item => [item.customerName, `€${item.totalSales.toFixed(2)}`]),
            headStyles: { fillColor: [47, 55, 69] },
            columnStyles: { 1: { halign: 'right' } }
        });
        y = (doc as any).lastAutoTable.finalY + 12;
    }
    
    doc.save(`Report_${orgName}_${dateRange.start}_${dateRange.end}.pdf`);
};

// Helper to correctly format a value for a CSV cell, handling commas, quotes, and newlines.
const escapeCsvCell = (cellData: any) => {
    const stringified = String(cellData ?? '');
    if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
        return `"${stringified.replace(/"/g, '""')}"`;
    }
    return stringified;
};

// Helper to convert an array of objects into a CSV string with a section header.
const arrayToCsvSection = (data: any[], sectionName: string) => {
    if (!Array.isArray(data) || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const headerRow = headers.map(escapeCsvCell).join(',');
    const rows = data.map(row => headers.map(header => escapeCsvCell(row[header])).join(','));
    return [`SECTION,${sectionName.toUpperCase()}`, headerRow, ...rows].join('\r\n');
};


/**
 * Processes the hierarchical customer data JSON into a single multi-section CSV string and triggers a download.
 * @param customerData The full data object from the 'export_customer_data' RPC function.
 * @param customerName The name of the customer for the filename.
 */
export const exportCustomerDataAsCsv = (customerData: any, customerName: string) => {
    const csvParts: string[] = [];

    // Extract and flatten nested items first to prepare for CSV conversion
    const invoiceItems: any[] = [];
    (customerData.invoices || []).forEach((invoice: any) => {
        if (invoice.items) {
            invoice.items.forEach((item: any) => invoiceItems.push({ invoice_id: invoice.id, ...item }));
            delete invoice.items; // Remove nested array from parent object
        }
    });

    const quoteItems: any[] = [];
    (customerData.quotes || []).forEach((quote: any) => {
        if (quote.items) {
            quote.items.forEach((item: any) => quoteItems.push({ quote_id: quote.id, ...item }));
            delete quote.items;
        }
    });
    
    const visitProducts: any[] = [];
    const visitExpenses: any[] = [];
     (customerData.visits || []).forEach((visit: any) => {
        if (visit.products) {
            visit.products.forEach((item: any) => visitProducts.push({ visit_id: visit.id, ...item }));
            delete visit.products;
        }
        if (visit.expenses) {
            visit.expenses.forEach((item: any) => visitExpenses.push({ visit_id: visit.id, ...item }));
            delete visit.expenses;
        }
    });
    
    // Convert each part of the data into a CSV section string
    const sections = [
        { name: 'customer_details', data: Array.isArray(customerData.customer_details) ? customerData.customer_details : [customerData.customer_details] },
        { name: 'invoices', data: customerData.invoices },
        { name: 'invoice_items', data: invoiceItems },
        { name: 'quotes', data: customerData.quotes },
        { name: 'quote_items', data: quoteItems },
        { name: 'visits', data: customerData.visits },
        { name: 'visit_products', data: visitProducts },
        { name: 'visit_expenses', data: visitExpenses },
        { name: 'tasks', data: customerData.tasks },
        { name: 'appointments', data: customerData.appointments },
        { name: 'email_logs', data: customerData.email_logs },
    ];
    
    sections.forEach(section => {
        if (section.data && section.data.length > 0) {
            csvParts.push(arrayToCsvSection(section.data, section.name));
        }
    });

    const fullCsvString = csvParts.join('\r\n\r\n');
    
    // Trigger download
    const blob = new Blob([fullCsvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const filename = `DSGVO_Export_${customerName.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
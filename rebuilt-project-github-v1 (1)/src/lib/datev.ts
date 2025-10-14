import { Invoice, Expense, DatevSettings } from '../types';
import { format } from 'date-fns';
import { downloadCsv } from './export';

interface DatevRow {
    'Umsatz (ohne Soll/Haben-Kz)': string;
    'Soll/Haben-Kennzeichen': 'S' | 'H';
    'WKZ Umsatz': 'EUR';
    'Kurs': string;
    'Basis-Umsatz': string;
    'WKZ Basis-Umsatz': string;
    'Konto': string;
    'Gegenkonto': string;
    'BU-Schlüssel': string;
    'Belegdatum': string;
    'Belegfeld 1': string;
    'Belegfeld 2': string;
    'Skonto': string;
    'Buchungstext': string;
}

const formatDatevDate = (date: Date) => format(date, 'ddMM');

export const generateDatevExport = async (
    invoices: (Invoice & { invoice_items: any[] | null; customers: any | null })[],
    expenses: Expense[],
    settings: DatevSettings,
    dateRange: { start: Date; end: Date }
) => {
    const rows: DatevRow[] = [];

    // Process Invoices (Revenues)
    invoices.forEach(invoice => {
        const invoiceDate = new Date(invoice.issue_date + 'T00:00:00'); // Parse as local
        
        const netTotalsByVat: { [key: number]: number } = {};
        (invoice.invoice_items || []).forEach(item => {
            const netAmount = item.quantity * item.unit_price;
            netTotalsByVat[item.vat_rate] = (netTotalsByVat[item.vat_rate] || 0) + netAmount;
        });
        
        Object.entries(netTotalsByVat).forEach(([vatRateStr, netAmount]) => {
            const vatRate = parseInt(vatRateStr);
            let revenueAccount = '';
            if (vatRate === 19) revenueAccount = settings.revenue_19 || '';
            else if (vatRate === 7) revenueAccount = settings.revenue_7 || '';
            else if (vatRate === 0) revenueAccount = settings.revenue_0 || '';

            if (revenueAccount && settings.debtor_account) {
                rows.push({
                    'Umsatz (ohne Soll/Haben-Kz)': (netAmount * (1 + vatRate / 100)).toFixed(2).replace('.', ','),
                    'Soll/Haben-Kennzeichen': 'S',
                    'WKZ Umsatz': 'EUR', 'Kurs': '', 'Basis-Umsatz': '', 'WKZ Basis-Umsatz': '',
                    'Konto': settings.debtor_account,
                    'Gegenkonto': revenueAccount,
                    'BU-Schlüssel': vatRate === 19 ? '3' : vatRate === 7 ? '2' : '', // Common BU for 19/7%
                    'Belegdatum': formatDatevDate(invoiceDate),
                    'Belegfeld 1': invoice.invoice_number,
                    'Belegfeld 2': '', 'Skonto': '',
                    'Buchungstext': `${invoice.invoice_number} ${invoice.customers?.name || ''}`.substring(0, 60),
                });
            }
        });
    });

    // Process Expenses
    expenses.forEach(expense => {
        const expenseDate = new Date(expense.expense_date + 'T00:00:00');
        const expenseAccount = settings.expense_mappings?.[expense.category || ''] || '';
        
        if (expenseAccount && settings.creditor_account) {
            rows.push({
                'Umsatz (ohne Soll/Haben-Kz)': expense.amount.toFixed(2).replace('.', ','),
                'Soll/Haben-Kennzeichen': 'H',
                'WKZ Umsatz': 'EUR', 'Kurs': '', 'Basis-Umsatz': '', 'WKZ Basis-Umsatz': '',
                'Konto': expenseAccount,
                'Gegenkonto': settings.creditor_account,
                'BU-Schlüssel': '9', // Assuming '9' for Vorsteuer 19%
                'Belegdatum': formatDatevDate(expenseDate),
                'Belegfeld 1': expense.expense_number,
                'Belegfeld 2': '', 'Skonto': '',
                'Buchungstext': `${expense.expense_number} ${expense.description}`.substring(0, 60),
            });
        }
    });

    if (rows.length === 0) {
        throw new Error("No data could be formatted for DATEV. Check your data and settings.");
    }
    
    // DATEV requires specific headers in the CSV file itself.
    const csvHeader = [
        `"EXTF";${rows.length + 1};210;"Buchungsstapel";8;`,
        `"ZoguOne Export";"";"";"";"";"";${format(dateRange.start, 'yyyyMMdd')};${format(dateRange.end, 'yyyyMMdd')};"";"";1;`,
        `"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen";"WKZ Umsatz";"Kurs";"Basis-Umsatz";"WKZ Basis-Umsatz";"Konto";"Gegenkonto";"BU-Schlüssel";"Belegdatum";"Belegfeld 1";"Belegfeld 2";"Skonto";"Buchungstext"`
    ].join('\r\n');
    
    // Custom CSV conversion for DATEV format (semicolon delimited, quoted values)
    const csvRows = rows.map(row => Object.values(row).map(val => `"${val}"`).join(';'));
    const csvBody = csvRows.join('\r\n');

    const csvData = `${csvHeader}\r\n${csvBody}`;

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `DATEV_Export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
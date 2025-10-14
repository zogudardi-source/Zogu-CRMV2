import { supabase } from "../services/supabase";
import { Profile, Quote, Invoice, QuoteItem } from "../types";
import { generateNextNumber } from "./numberGenerator";

/**
 * Converts a given quote into a new invoice.
 * @param quoteId The ID of the quote to convert.
 * @param profile The profile of the user performing the action.
 * @returns The newly created invoice object.
 */
export const convertQuoteToInvoice = async (quoteId: number, profile: Profile): Promise<Invoice> => {
  if (!profile.org_id) {
    throw new Error("User is not associated with an organization.");
  }

  // 1. Fetch the full quote data with its items, ensuring it belongs to the user's org
  const { data: quoteRows, error: quoteError } = await supabase
    .from('quotes')
    .select('*, quote_items:quote_items!left(*)')
    .eq('id', quoteId)
    .eq('org_id', profile.org_id);

  if (quoteError) {
    throw new Error(quoteError.message);
  }
  if (!quoteRows || quoteRows.length === 0) {
    throw new Error("Quote not found or you do not have permission to access it.");
  }

  // Reconstruct the quote with all items from the potentially multiple rows
  const firstRow = quoteRows[0];
  const allItems = quoteRows.map(row => row.quote_items).flat().filter(Boolean);
  const uniqueItems = Array.from(new Map(allItems.map(item => [item.id, item])).values());
  const { quote_items, ...quoteData } = firstRow;
  const quote = { ...quoteData, quote_items: uniqueItems };

  const quoteItems: QuoteItem[] = quote.quote_items || [];
  
  if (quote.status === 'accepted') {
    // Check if an invoice already exists for this quote to prevent duplicates
    const { data: existingInvoice, error: checkError } = await supabase
      .from('invoices')
      .select('id')
      .ilike('customer_notes', `%Converted from Quote #${quote.quote_number}%`)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') { // Ignore "no rows" error
      throw checkError;
    }

    if (existingInvoice) {
      throw new Error(`An invoice has already been created for quote #${quote.quote_number}.`);
    }
  }

  // 2. Prepare the new invoice data
  const newInvoiceNumber = await generateNextNumber(profile.org_id, 'invoice');
  const today = new Date();
  const dueDate = new Date();
  dueDate.setDate(today.getDate() + 14); // Due in 14 days by default

  const newInvoiceData: Omit<Invoice, 'id' | 'customers' | 'invoice_items' | 'organizations' | 'created_at'> = {
    user_id: profile.id,
    org_id: profile.org_id,
    customer_id: quote.customer_id,
    invoice_number: newInvoiceNumber,
    issue_date: today.toISOString().split('T')[0],
    due_date: dueDate.toISOString().split('T')[0],
    total_amount: quote.total_amount,
    status: 'draft',
    customer_notes: `Converted from Quote #${quote.quote_number}\n\n${quote.customer_notes || ''}`.trim(),
    internal_notes: quote.internal_notes || '',
  };

  // 3. Insert the new invoice
  const { data: createdInvoice, error: invoiceInsertError } = await supabase
    .from('invoices')
    .insert(newInvoiceData)
    .select()
    .single();

  if (invoiceInsertError || !createdInvoice) {
    throw new Error(invoiceInsertError?.message || "Failed to create invoice.");
  }
  
  // 4. Prepare and insert the invoice items
  if (quoteItems.length > 0) {
    const newInvoiceItems = quoteItems.map(item => ({
      invoice_id: createdInvoice.id,
      product_id: item.product_id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      vat_rate: item.vat_rate,
    }));

    const { error: itemsInsertError } = await supabase
      .from('invoice_items')
      .insert(newInvoiceItems);

    if (itemsInsertError) {
      // Rollback: if items fail, delete the invoice we just created
      await supabase.from('invoices').delete().eq('id', createdInvoice.id);
      throw new Error(itemsInsertError.message || "Failed to create invoice items.");
    }
  }

  // 5. Update the original quote's status to 'accepted'
  const { error: quoteUpdateError } = await supabase
    .from('quotes')
    .update({ status: 'accepted' })
    .eq('id', quoteId);
  
  if (quoteUpdateError) {
    // This is not a critical failure, but should be logged.
    console.warn(`Failed to update quote #${quote.quote_number} status to 'accepted'.`, quoteUpdateError);
  }

  // 6. Return the newly created invoice
  return createdInvoice as Invoice;
};
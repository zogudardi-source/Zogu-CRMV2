import { supabase } from '../services/supabase';

export type SequenceType = 'customer' | 'quote' | 'invoice' | 'task' | 'product' | 'appointment' | 'expense' | 'visit';

/**
 * Generates the next sequential number for a given document type.
 * This relies on a backend Supabase RPC function `get_next_sequence_value`
 * to ensure atomic, gap-less number generation.
 * @param orgId The UUID of the organization.
 * @param type The type of document sequence.
 * @returns A formatted number string (e.g., CUST-000001).
 */
export const generateNextNumber = async (orgId: string, type: SequenceType): Promise<string> => {
    const year = new Date().getFullYear();
    let sequenceName: string = type;
    if (['quote', 'invoice', 'task', 'appointment', 'expense', 'visit'].includes(type)) {
        sequenceName = `${type}_${year}`;
    }

    // FIX: Use the correct parameter names that match the SQL function definition.
    const { data, error } = await supabase.rpc('get_next_sequence_value', {
        p_sequence_name: sequenceName,
        p_organization_id: orgId
    });

    if (error) {
        // Log the detailed error message from Supabase for easier debugging
        console.error(`Error getting next number for ${type}:`, error.message);
        // Provide a more helpful error message to the user.
        throw new Error(`Could not generate the next number for ${type}. Your database might be missing the required 'get_next_sequence_value' function or permissions. Please check your Supabase SQL setup.`);
    }
    const nextVal = data;

    if (nextVal === null || typeof nextVal !== 'number') {
         console.error(`Error getting next number for ${type}: RPC function returned an invalid value.`, data);
         throw new Error(`Could not generate the next number for ${type}. The database function returned an unexpected value.`);
    }

    switch (type) {
        case 'customer': return `CUST-${String(nextVal).padStart(6, '0')}`;
        case 'quote': return `QUO-${year}-${String(nextVal).padStart(4, '0')}`;
        case 'invoice': return `INV-${year}-${String(nextVal).padStart(4, '0')}`;
        case 'task': return `TASK-${year}-${String(nextVal).padStart(4, '0')}`;
        case 'product': return `PROD-${String(nextVal).padStart(5, '0')}`;
        case 'appointment': return `APP-${year}-${String(nextVal).padStart(4, '0')}`;
        case 'expense': return `EXP-${year}-${String(nextVal).padStart(4, '0')}`;
        case 'visit': return `VIS-${year}-${String(nextVal).padStart(4, '0')}`;
        default: throw new Error('Unknown sequence type');
    }
};
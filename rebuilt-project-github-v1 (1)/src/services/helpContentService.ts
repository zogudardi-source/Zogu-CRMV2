import { supabase } from './supabase';

const helpCache = new Map<string, string>();

/**
 * Fetches help content for a specific page and language from the database.
 * Implements in-memory caching to reduce redundant database calls.
 * @param pageKey The unique key for the page (e.g., 'dashboard', 'invoices_list').
 * @param language The desired language ('de' or 'al').
 * @returns The markdown content string for the help page.
 */
export const getHelpForPage = async (pageKey: string, language: 'de' | 'al'): Promise<string> => {
    const cacheKey = `${pageKey}-${language}`;
    if (helpCache.has(cacheKey)) {
        return helpCache.get(cacheKey)!;
    }

    const contentColumn = language === 'de' ? 'content_de' : 'content_al';
    const fallbackColumn = language === 'de' ? 'content_al' : 'content_de';

    try {
        const { data, error } = await supabase
            .from('help_content')
            .select(`${contentColumn}, ${fallbackColumn}`)
            .eq('page_key', pageKey)
            .single();

        if (error) {
            console.error(`Error fetching help content for ${pageKey}:`, error.message);
            // Don't cache errors, so it can be retried.
            return `Help content not found for this page. (${error.message})`;
        }

        const content = data?.[contentColumn] || data?.[fallbackColumn] || 'Help content is not available for this page.';
        
        helpCache.set(cacheKey, content);
        return content;

    } catch (e: any) {
        return `An unexpected error occurred while fetching help content: ${e.message}`;
    }
};

/**
 * Clears the in-memory cache for help content.
 * This should be called after a super admin saves changes to the help content.
 */
export const invalidateHelpCache = () => {
    helpCache.clear();
};
import { format, isValid } from 'date-fns';
import { Notification } from '../types';

/**
 * Parses a date string or Date object into a local Date object.
 * This is crucial for handling timezone issues with date-only strings from a database.
 * A string '2024-10-15' will be parsed as local midnight, not UTC midnight.
 * A full ISO string will be parsed correctly.
 * @param date The date to parse.
 * @returns A valid Date object, or null if the input is invalid.
 */
export const parseAsLocalDate = (date: Date | string | null | undefined): Date | null => {
    if (!date) return null;
    if (date instanceof Date) {
        return isValid(date) ? date : null;
    }
    if (typeof date === 'string') {
        let parsedDate: Date;
        // If the string from the DB is a full timestamp (e.g., '2024-07-26T14:30:00+00:00'),
        // it will contain a 'T'. In that case, we use the browser's native Date parsing
        // which correctly handles the time and timezone.
        if (date.includes('T')) {
            parsedDate = new Date(date);
        } else {
            // If it's a date-only string (e.g., '2024-07-26'), we append 'T00:00:00'
            // to ensure it's parsed in the local timezone, preventing it from shifting
            // to the previous day (a common issue with `new Date('YYYY-MM-DD')`).
            parsedDate = new Date(date + 'T00:00:00');
        }
        
        if (isValid(parsedDate)) {
            return parsedDate;
        }
    }
    console.warn("Invalid date value provided to parseAsLocalDate:", date);
    return null;
};


/**
 * Formats a date string or Date object into European date format (dd.MM.yyyy).
 * Handles timezone issues with date-only strings.
 * @param date The date to format.
 * @returns The formatted date string, or an empty string if the date is invalid.
 */
export const formatEuropeanDate = (date: Date | string | null | undefined): string => {
    const parsedDate = parseAsLocalDate(date);
    if (!parsedDate) return '';
    try {
        return format(parsedDate, 'dd.MM.yyyy');
    } catch (e) {
        console.error("Error formatting date:", date, e);
        return '';
    }
};

/**
 * Formats a date string or Date object into 24-hour time format (HH:mm).
 * Handles timezone issues with date-only strings.
 * @param date The date to format.
 * @returns The formatted time string, or an empty string if the date is invalid.
 */
export const formatEuropeanTime = (date: Date | string | null | undefined): string => {
    const parsedDate = parseAsLocalDate(date);
    if (!parsedDate) return '';
    try {
        return format(parsedDate, 'HH:mm');
    } catch (e) {
        console.error("Error formatting time:", date, e);
        return '';
    }
};

export const translateNotification = (notification: { title: string, body: string }, t: (key: any) => string): { title: string, body: string } => {
    let { title, body } = notification;

    // Check for new translatable format first
    try {
        const bodyJson = JSON.parse(body);
        if (bodyJson && bodyJson.key) {
            // This is the new format
            const translatedTitle = t(title as any);
            let translatedBody = t(bodyJson.key as any);
            if (bodyJson.params) {
                for (const [key, value] of Object.entries(bodyJson.params)) {
                    translatedBody = translatedBody.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
                }
            }
            return { title: translatedTitle, body: translatedBody };
        }
    } catch (e) {
        // Not JSON, fall through to legacy parsing
    }

    // Legacy parsing for old notifications from DB triggers etc.
    if (title === 'Low Stock Warning') {
        const translatedTitle = t('lowStockWarning');
        const match = body.match(/Stock for "(.*)" is low\./);
        const translatedBody = match && match[1] ? t('stockForIsLow').replace('{productName}', match[1]) : body;
        return { title: translatedTitle, body: translatedBody };
    }

    if (title === 'New Visit Assigned') {
        const translatedTitle = t('newVisitAssigned');
        const match = body.match(/You've been assigned visit #(.+) by (.+)\./);
        const translatedBody = match && match[1] && match[2] 
            ? t('youveBeenAssignedVisitBy').replace('{visitNumber}', match[1]).replace('{userName}', match[2])
            : body;
        return { title: translatedTitle, body: translatedBody };
    }

    if (title === 'New Task Assigned') {
        const translatedTitle = t('newTaskAssigned');
        const match = body.match(/Task "(.*)" was assigned to you by (.+)\./);
        const translatedBody = match && match[1] && match[2]
            ? t('taskWasAssignedToYouBy').replace('{taskTitle}', match[1]).replace('{userName}', match[2])
            : body;
        return { title: translatedTitle, body: translatedBody };
    }

    if (title === 'Task Updated') {
        const translatedTitle = t('taskUpdated');
        const match = body.match(/Task "(.*)" was updated by (.+)\./);
        const translatedBody = match && match[1] && match[2]
            ? t('taskWasUpdatedBy').replace('{taskTitle}', match[1]).replace('{userName}', match[2])
            : body;
        return { title: translatedTitle, body: translatedBody };
    }

    if (title === 'New Appointment Assigned') {
        const translatedTitle = t('newAppointmentAssigned');
        const match = body.match(/Appointment "(.*)" was assigned to you by (.+)\./);
        const translatedBody = match && match[1] && match[2]
            ? t('appointmentWasAssignedToYouBy').replace('{appointmentTitle}', match[1]).replace('{userName}', match[2])
            : body;
        return { title: translatedTitle, body: translatedBody };
    }

    // Default fallback if no rules match
    return { title, body };
};

// Helper to safely access nested properties from a context object
const getNestedValue = (obj: any, path: string) => {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

/**
 * Replaces placeholders in a string with values from a context object.
 * e.g., "Hello {customer.name}" -> "Hello John Doe"
 * @param content The string with placeholders.
 * @param context The data object to source values from.
 * @returns The resolved string.
 */
export const resolvePlaceholders = (content: string, context: any): string => {
    // Regex to match either {placeholder} or [placeholder]
    return content.replace(/\{([^}]+)\}|\[([^\]]+)\]/g, (match, curlyPath, squarePath) => {
        const path = curlyPath || squarePath;
        if (!path) return match; // Should not happen

        const key = path.trim();
        let value = getNestedValue(context, key);

        // Special handling for dates
        if ((key.endsWith('.date') || key.endsWith('_date') || key.endsWith('_time')) && value) {
            value = formatEuropeanDate(value);
        }
        
        // Special handling for amounts
        if (key.endsWith('.total') && typeof value === 'number') {
            value = `€${value.toFixed(2)}`;
        }

        return value !== undefined ? String(value) : match;
    });
};
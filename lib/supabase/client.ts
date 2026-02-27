import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = 'https://your-supabase-url.supabase.co';
const supabaseKey = 'your-anon-key';
const supabase = createClient(supabaseUrl, supabaseKey);

// Real-time subscription example
const subscribeToChanges = (table) => {
    return supabase
        .from(table)
        .on('*', payload => {
            console.log('Change received!', payload);
        })
        .subscribe();
};

// Export client and functions
export { supabase, subscribeToChanges };
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lxiqjnrtxwbdektizhim.supabase.co'
const supabaseKey = 'sb_publishable_BRvZ1svF9K5XLWpJsWtIuQ_hs9KtnHz'

export const supabase = createClient(supabaseUrl, supabaseKey)
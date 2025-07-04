use anchor_lang::prelude::*;

#[account]
pub struct GlobalPool {
    pub admin: Pubkey,
    pub max_orders_per_user: u64,
    pub max_orders_per_book: u64,
    pub total_market_count: u64,
    pub market_seq_num: u64,
    pub extra: u128,
}

impl Default for GlobalPool {
    #[inline]
    fn default() -> GlobalPool {
        GlobalPool {
            admin: Pubkey::default(),
            max_orders_per_user: 0,
            max_orders_per_book: 0,
            total_market_count: 0,
            market_seq_num: 0,
            extra: 0,
        }
    }
}

impl GlobalPool {
    pub const DATA_SIZE: usize = 8 + std::mem::size_of::<GlobalPool>();
}

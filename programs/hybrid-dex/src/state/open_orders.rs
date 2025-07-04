use anchor_lang::prelude::*;

#[account]
pub struct UserMarketOrders {
    pub address: Pubkey,
    pub market: Pubkey,
    pub opened_orders_count: u64,
    pub base_deposit_total: u64,
    pub quote_deposit_total: u64,
    pub base_total_volume: u64,
    pub quote_total_volume: u64,
    pub extra: u128,
}

impl Default for UserMarketOrders {
    #[inline]
    fn default() -> UserMarketOrders {
        UserMarketOrders {
            address: Pubkey::default(),
            market: Pubkey::default(),
            opened_orders_count: 0,
            base_deposit_total: 0,
            quote_deposit_total: 0,
            base_total_volume: 0,
            quote_total_volume: 0,
            extra: 0,
        }
    }
}

impl UserMarketOrders {
    pub const DATA_SIZE: usize = 8 + std::mem::size_of::<UserMarketOrders>();
}

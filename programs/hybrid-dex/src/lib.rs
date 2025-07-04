pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use instructions::*;
pub use state::*;
pub use utils::*;

declare_id!("6z1NX1CodyGPbJ8sAVirasDsYgw1xSnkyjyprSnMfvRy");

#[program]
pub mod hybrid_dex {
    use super::*;

    /**
     * Initialize global pool
     * admin initialize global configs
     */
    pub fn initialize(
        mut ctx: Context<Initialize>,
        max_orders_per_user: u64,
        max_orders_per_book: u64,
    ) -> Result<()> {
        Initialize::process_instruction(&mut ctx, max_orders_per_user, max_orders_per_book)
    }

    /** Admin can transfer admin authority */
    pub fn transfer_admin(mut ctx: Context<TransferAdmin>, new_admin: Pubkey) -> Result<()> {
        TransferAdmin::process_instruction(&mut ctx, new_admin)
    }

    /** Admin can change global config */
    pub fn change_config(
        mut ctx: Context<ChangeConfig>,
        max_orders_per_user: Option<u64>,
        max_orders_per_book: Option<u64>,
    ) -> Result<()> {
        ChangeConfig::process_instruction(&mut ctx, max_orders_per_user, max_orders_per_book)
    }

    /** Create market */
    pub fn create_market(mut ctx: Context<CreateMarket>, name: String) -> Result<()> {
        CreateMarket::process_instruction(&mut ctx, name)
    }

    /** Close market with market owner authority or global admin authority */
    pub fn close_market(mut ctx: Context<CloseMarket>, seed: u64) -> Result<()> {
        CloseMarket::process_instruction(&mut ctx, seed)
    }

    /** Create open orders PDA for user in certain market */
    pub fn create_open_orders(mut ctx: Context<CreateOpenOrders>) -> Result<()> {
        CreateOpenOrders::process_instruction(&mut ctx)
    }

    /** Place order as maker */
    pub fn place_order(
        mut ctx: Context<PlaceOrder>,
        side: Side,
        price: u64,
        quantity: u64,
    ) -> Result<()> {
        PlaceOrder::process_instruction(&mut ctx, side, price, quantity)
    }

    /** Cancel order as owner */
    pub fn cancel_order(
        mut ctx: Context<CancelOrder>,
        seed: u64,
        side: Side,
        order_id: u64,
    ) -> Result<()> {
        CancelOrder::process_instruction(&mut ctx, seed, side, order_id)
    }

    /** Take order as taker */
    pub fn take_order(
        mut ctx: Context<TakeOrder>,
        seed: u64,
        side: Side,
        order_id: u64,
    ) -> Result<()> {
        TakeOrder::process_instruction(&mut ctx, seed, side, order_id)
    }
}

use crate::*;

#[derive(Accounts)]
pub struct CreateOpenOrders<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub market: Box<Account<'info, Market>>,

    #[account(
        init,
        space = UserMarketOrders::DATA_SIZE,
        seeds = [USER_MARKET_ORDER_SEED.as_bytes(), market.key().as_ref(), user.key().as_ref()],
        bump,
        payer = user,
    )]
    pub user_open_orders: Box<Account<'info, UserMarketOrders>>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl CreateOpenOrders<'_> {
    pub fn process_instruction(ctx: &mut Context<Self>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let user_open_orders = &mut ctx.accounts.user_open_orders;

        user_open_orders.address = ctx.accounts.user.key();
        user_open_orders.market = market.key();

        Ok(())
    }
}

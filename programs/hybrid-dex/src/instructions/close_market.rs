use anchor_spl::token::Mint;

use crate::*;

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct CloseMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_AUTHORITY_SEED.as_bytes()],
        bump,
    )]
    pub global_pool: Box<Account<'info, GlobalPool>>,

    #[account(
        mut,
        has_one = base_mint,
        has_one = quote_mint,
        close = authority,
        seeds = [MARKET_SEED.as_bytes(), seed.to_le_bytes().as_ref()],
        bump,
    )]
    pub market: Box<Account<'info, Market>>,

    pub base_mint: Box<Account<'info, Mint>>,

    pub quote_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        has_one = market,
        close = authority,
        seeds = [BID_BOOK_SEED.as_bytes(), market.key().as_ref()],
        bump,
    )]
    pub bids_book: Box<Account<'info, Book>>,

    #[account(
        mut,
        has_one = market,
        close = authority,
        seeds = [ASK_BOOK_SEED.as_bytes(), market.key().as_ref()],
        bump,
    )]
    pub asks_book: Box<Account<'info, Book>>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl CloseMarket<'_> {
    pub fn process_instruction(ctx: &mut Context<Self>, _seed: u64) -> Result<()> {
        let global_pool = &mut ctx.accounts.global_pool;
        let market = &mut ctx.accounts.market;

        // check market authority or admin
        require!(
            market.market_authority.eq(&ctx.accounts.authority.key()),
            HybridDexError::InvalidCloseMarketAdmin
        );

        // check market order book is empty
        require!(
            ctx.accounts.bids_book.orders_count == 0 && ctx.accounts.asks_book.orders_count == 0,
            HybridDexError::NonEmptyMarket
        );

        global_pool.total_market_count -= 1;

        Ok(())
    }
}

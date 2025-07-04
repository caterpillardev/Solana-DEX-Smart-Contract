use anchor_spl::token::Mint;

use crate::*;

#[derive(Accounts)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_AUTHORITY_SEED.as_bytes()],
        bump,
    )]
    pub global_pool: Box<Account<'info, GlobalPool>>,

    #[account(
        init,
        space = Market::DATA_SIZE,
        seeds = [MARKET_SEED.as_bytes(), global_pool.market_seq_num.to_le_bytes().as_ref()],
        bump,
        payer = authority
    )]
    pub market: Box<Account<'info, Market>>,

    pub base_mint: Box<Account<'info, Mint>>,

    pub quote_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        space = Book::size(global_pool.max_orders_per_book),
        seeds = [BID_BOOK_SEED.as_bytes(), market.key().as_ref()],
        bump,
        payer = authority
    )]
    pub bids_book: Box<Account<'info, Book>>,

    #[account(
        init,
        space = Book::size(global_pool.max_orders_per_book),
        seeds = [ASK_BOOK_SEED.as_bytes(), market.key().as_ref()],
        bump,
        payer = authority
    )]
    pub asks_book: Box<Account<'info, Book>>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl CreateMarket<'_> {
    pub fn process_instruction(ctx: &mut Context<Self>, name: String) -> Result<()> {
        let global_pool = &mut ctx.accounts.global_pool;
        let market = &mut ctx.accounts.market;
        let bids_book = &mut ctx.accounts.bids_book;
        let asks_book = &mut ctx.accounts.asks_book;

        market.seed = global_pool.market_seq_num;
        market.market_authority = ctx.accounts.authority.key();

        market.base_mint = ctx.accounts.base_mint.key();
        market.quote_mint = ctx.accounts.quote_mint.key();

        market.base_decimal = ctx.accounts.base_mint.decimals;
        market.quote_decimal = ctx.accounts.quote_mint.decimals;

        market.create_at = Clock::get().unwrap().unix_timestamp;

        market.bids = bids_book.key();
        market.asks = asks_book.key();

        market.name = fill_from_str(&name)?;

        bids_book.side = Side::Bid;
        bids_book.market = market.key();

        asks_book.side = Side::Ask;
        asks_book.market = market.key();

        global_pool.total_market_count += 1;
        global_pool.market_seq_num += 1;

        Ok(())
    }
}

use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::*;

#[derive(Accounts)]
pub struct PlaceOrder<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(
        seeds = [GLOBAL_AUTHORITY_SEED.as_bytes()],
        bump,
    )]
    pub global_pool: Box<Account<'info, GlobalPool>>,

    #[account(
        mut,
        has_one = base_mint,
        has_one = quote_mint,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        has_one = market,
        seeds = [USER_MARKET_ORDER_SEED.as_bytes(), market.key().as_ref(), maker.key().as_ref()],
        bump,
        constraint = user_open_orders.address.eq(&maker.key()) @ HybridDexError::InvalidAccountOwner,
    )]
    pub user_open_orders: Box<Account<'info, UserMarketOrders>>,

    pub base_mint: Box<Account<'info, Mint>>,

    pub quote_mint: Box<Account<'info, Mint>>,

    #[account(
        init_if_needed,
        associated_token::mint = base_mint,
        associated_token::authority = maker,
        payer = maker,
    )]
    pub user_base_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        associated_token::mint = quote_mint,
        associated_token::authority = maker,
        payer = maker,
    )]
    pub user_quote_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        associated_token::mint = base_mint,
        associated_token::authority = market,
        payer = maker,
    )]
    pub base_vault_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        associated_token::mint = quote_mint,
        associated_token::authority = market,
        payer = maker,
    )]
    pub quote_vault_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [BID_BOOK_SEED.as_bytes(), market.key().as_ref()],
        bump,
    )]
    pub bids_book: Box<Account<'info, Book>>,

    #[account(
        mut,
        seeds = [ASK_BOOK_SEED.as_bytes(), market.key().as_ref()],
        bump,
    )]
    pub asks_book: Box<Account<'info, Book>>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl PlaceOrder<'_> {
    pub fn process_instruction(
        ctx: &mut Context<Self>,
        side: Side,
        price: u64,
        quantity: u64,
    ) -> Result<()> {
        let global_pool = &ctx.accounts.global_pool;
        let market = &mut ctx.accounts.market;
        let user_open_orders = &mut ctx.accounts.user_open_orders;

        let new_order = OpenedOrder {
            order_id: market.order_seq_num,
            owner: ctx.accounts.maker.key(),
            price,
            quantity,
            created_at: Clock::get().unwrap().unix_timestamp,
        };

        // check max user opened orders
        require!(
            user_open_orders.opened_orders_count < global_pool.max_orders_per_user,
            HybridDexError::OpenOrdersFull
        );

        user_open_orders.opened_orders_count += 1;

        if side == Side::Bid {
            let bids_book = &mut ctx.accounts.bids_book;

            // check max market order book
            require!(
                bids_book.orders_count < global_pool.max_orders_per_book,
                HybridDexError::OpenOrdersFull
            );

            bids_book.orders_count += 1;
            bids_book.insert_order(new_order);

            // check user quote token balance
            require!(
                ctx.accounts.user_quote_token_account.amount >= quantity,
                HybridDexError::InsufficientDepositBalance
            );

            user_open_orders.quote_deposit_total += quantity;

            // transfer quote token to vault
            let cpi_accounts = Transfer {
                from: ctx.accounts.user_quote_token_account.to_account_info(),
                to: ctx.accounts.quote_vault_account.to_account_info(),
                authority: ctx.accounts.maker.to_account_info(),
            };

            token::transfer(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
                quantity,
            )?;
        } else {
            let asks_book = &mut ctx.accounts.asks_book;

            // check max market order book
            require!(
                asks_book.orders_count < global_pool.max_orders_per_book,
                HybridDexError::OpenOrdersFull
            );

            asks_book.orders_count += 1;
            asks_book.insert_order(new_order);

            // check user base token balance
            require!(
                ctx.accounts.user_base_token_account.amount >= quantity,
                HybridDexError::InsufficientDepositBalance
            );

            user_open_orders.base_deposit_total += quantity;

            // transfer base token to vault
            let cpi_accounts = Transfer {
                from: ctx.accounts.user_base_token_account.to_account_info(),
                to: ctx.accounts.base_vault_account.to_account_info(),
                authority: ctx.accounts.maker.to_account_info(),
            };

            token::transfer(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
                quantity,
            )?;
        }

        market.order_seq_num += 1;

        Ok(())
    }
}

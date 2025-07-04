use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::*;

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct TakeOrder<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,

    pub maker: SystemAccount<'info>,

    #[account(
        mut,
        has_one = base_mint,
        has_one = quote_mint,
        seeds = [MARKET_SEED.as_bytes(), seed.to_le_bytes().as_ref()],
        bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        has_one = market,
        seeds = [USER_MARKET_ORDER_SEED.as_bytes(), market.key().as_ref(), maker.key().as_ref()],
        bump,
        constraint = maker_open_orders.address.eq(&maker.key()) @ HybridDexError::InvalidAccountOwner,
    )]
    pub maker_open_orders: Box<Account<'info, UserMarketOrders>>,

    #[account(
        mut,
        has_one = market,
        seeds = [USER_MARKET_ORDER_SEED.as_bytes(), market.key().as_ref(), taker.key().as_ref()],
        bump,
        constraint = taker_open_orders.address.eq(&taker.key()) @ HybridDexError::InvalidAccountOwner,
    )]
    pub taker_open_orders: Box<Account<'info, UserMarketOrders>>,

    pub base_mint: Box<Account<'info, Mint>>,

    pub quote_mint: Box<Account<'info, Mint>>,

    #[account(
        init_if_needed,
        associated_token::mint = base_mint,
        associated_token::authority = maker,
        payer = taker,
    )]
    pub maker_base_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        associated_token::mint = quote_mint,
        associated_token::authority = maker,
        payer = taker,
    )]
    pub maker_quote_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        associated_token::mint = base_mint,
        associated_token::authority = taker,
        payer = taker,
    )]
    pub taker_base_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        associated_token::mint = quote_mint,
        associated_token::authority = taker,
        payer = taker,
    )]
    pub taker_quote_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        associated_token::mint = base_mint,
        associated_token::authority = market,
        payer = taker,
    )]
    pub base_vault_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        associated_token::mint = quote_mint,
        associated_token::authority = market,
        payer = taker,
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

impl TakeOrder<'_> {
    pub fn process_instruction(
        ctx: &mut Context<Self>,
        seed: u64,
        maker_side: Side,
        order_id: u64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let maker_open_orders = &mut ctx.accounts.maker_open_orders;
        let taker_open_orders = &mut ctx.accounts.taker_open_orders;

        maker_open_orders.opened_orders_count -= 1;

        if maker_side == Side::Bid {
            let bids_book = &mut ctx.accounts.bids_book;
            bids_book.orders_count -= 1;
            let order = bids_book.remove_order(order_id)?;
            let base_amount = (order.price as u128 * order.quantity as u128
                / ((10 as u128).pow(market.quote_decimal as u32)))
                as u64;

            // check quote token vault balance
            require!(
                ctx.accounts.quote_vault_account.amount >= order.quantity,
                HybridDexError::InsufficientWithdrawBalance
            );

            // check taker base token balance
            require!(
                ctx.accounts.taker_base_token_account.amount >= base_amount,
                HybridDexError::InsufficientDepositBalance
            );

            maker_open_orders.quote_deposit_total -= order.quantity;
            maker_open_orders.base_total_volume += base_amount;
            maker_open_orders.quote_total_volume += order.quantity;

            taker_open_orders.base_total_volume += base_amount;
            taker_open_orders.quote_total_volume += order.quantity;

            market.base_total_volume += base_amount;
            market.quote_total_volume += order.quantity;

            let seed_bytes = seed.to_le_bytes();
            let seeds = &[MARKET_SEED.as_bytes(), &seed_bytes, &[ctx.bumps.market]];
            let signers_seeds = &[&seeds[..]];

            // transfer quote token from vault to taker
            let cpi_accounts = Transfer {
                from: ctx.accounts.quote_vault_account.to_account_info(),
                to: ctx.accounts.taker_quote_token_account.to_account_info(),
                authority: market.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signers_seeds,
                ),
                order.quantity,
            )?;

            // transfer base token from taker to maker
            let cpi_accounts = Transfer {
                from: ctx.accounts.taker_base_token_account.to_account_info(),
                to: ctx.accounts.maker_base_token_account.to_account_info(),
                authority: ctx.accounts.taker.to_account_info(),
            };

            token::transfer(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
                base_amount,
            )?;
        } else {
            let asks_book = &mut ctx.accounts.asks_book;
            asks_book.orders_count -= 1;
            let order = asks_book.remove_order(order_id)?;
            let quote_amount = (order.price as u128
                * ((10 as u128).pow(market.quote_decimal as u32))
                / order.quantity as u128) as u64;

            // check base token vault balance
            require!(
                ctx.accounts.base_vault_account.amount >= order.quantity,
                HybridDexError::InsufficientWithdrawBalance
            );

            // check taker quote token balance
            require!(
                ctx.accounts.taker_quote_token_account.amount >= quote_amount,
                HybridDexError::InsufficientDepositBalance
            );

            maker_open_orders.base_deposit_total -= order.quantity;
            maker_open_orders.base_total_volume += order.quantity;
            maker_open_orders.quote_total_volume += quote_amount;

            taker_open_orders.base_total_volume += order.quantity;
            taker_open_orders.quote_total_volume += quote_amount;

            market.base_total_volume += order.quantity;
            market.quote_total_volume += quote_amount;

            let seed_bytes = seed.to_le_bytes();
            let seeds = &[MARKET_SEED.as_bytes(), &seed_bytes, &[ctx.bumps.market]];
            let signers_seeds = &[&seeds[..]];

            // transfer base token from vault to taker
            let cpi_accounts = Transfer {
                from: ctx.accounts.base_vault_account.to_account_info(),
                to: ctx.accounts.taker_base_token_account.to_account_info(),
                authority: market.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signers_seeds,
                ),
                order.quantity,
            )?;

            // transfer quote token from taker to maker
            let cpi_accounts = Transfer {
                from: ctx.accounts.taker_quote_token_account.to_account_info(),
                to: ctx.accounts.maker_quote_token_account.to_account_info(),
                authority: ctx.accounts.taker.to_account_info(),
            };

            token::transfer(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
                quote_amount,
            )?;
        }

        Ok(())
    }
}

use crate::*;

#[derive(Accounts)]
pub struct ChangeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_AUTHORITY_SEED.as_bytes()],
        bump,
        has_one = admin @ HybridDexError::InvalidAdmin,
    )]
    pub global_pool: Box<Account<'info, GlobalPool>>,
}

impl ChangeConfig<'_> {
    pub fn process_instruction(
        ctx: &mut Context<Self>,
        max_orders_per_user: Option<u64>,
        max_orders_per_book: Option<u64>,
    ) -> Result<()> {
        let global_pool = &mut ctx.accounts.global_pool;

        if let Some(value) = max_orders_per_user {
            global_pool.max_orders_per_user = value;
        }
        if let Some(value) = max_orders_per_book {
            global_pool.max_orders_per_book = value;
        }

        Ok(())
    }
}

use crate::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        space = GlobalPool::DATA_SIZE,
        seeds = [GLOBAL_AUTHORITY_SEED.as_bytes()],
        bump,
        payer = admin
    )]
    pub global_pool: Box<Account<'info, GlobalPool>>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl Initialize<'_> {
    pub fn process_instruction(
        ctx: &mut Context<Self>,
        max_orders_per_user: u64,
        max_orders_per_book: u64,
    ) -> Result<()> {
        let global_pool = &mut ctx.accounts.global_pool;

        global_pool.admin = ctx.accounts.admin.key();

        global_pool.max_orders_per_user = max_orders_per_user;
        global_pool.max_orders_per_book = max_orders_per_book;

        Ok(())
    }
}

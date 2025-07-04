use crate::*;

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
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

impl TransferAdmin<'_> {
    pub fn process_instruction(ctx: &mut Context<Self>, new_admin: Pubkey) -> Result<()> {
        let global_pool = &mut ctx.accounts.global_pool;

        global_pool.admin = new_admin;

        Ok(())
    }
}

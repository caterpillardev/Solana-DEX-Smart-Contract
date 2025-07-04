use anchor_lang::prelude::*;

#[error_code]
pub enum HybridDexError {
    #[msg("Admin address dismatch")]
    InvalidAdmin,
    #[msg("Name lenght above limit")]
    InvalidInputNameLength,
    #[msg("The signer of this transaction is not this market's authority or admin.")]
    InvalidCloseMarketAdmin,
    #[msg("Cannot close a non-empty market")]
    NonEmptyMarket,
    #[msg("Account owner does not match with passed address")]
    InvalidAccountOwner,
    #[msg("No free order index in user open orders account")]
    OpenOrdersFull,
    #[msg("Deposit token account balance insufficient")]
    InsufficientDepositBalance,
    #[msg("Market token vault balance insufficient")]
    InsufficientWithdrawBalance,
    #[msg("Not found order id from market order book")]
    OrderNotFound,

    #[msg("Target token mint incorrect")]
    InvalidTokenMint,
    #[msg("Requested amount to buy is not in range of min & max")]
    InvalidRequestAmountRange,
    #[msg("Unable to withdraw or sweep before presale period ends")]
    PresaleNotFinished,
    #[msg("Already purchased token")]
    AlreadyPurchased,
    #[msg("Can purchase when presale started")]
    PresaleNotStarted,
    #[msg("Cannot purchase after presale ended")]
    PresaleFinished,
    #[msg("User not have any purchase")]
    NeverPurchased,
}

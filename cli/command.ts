import { program } from 'commander';
import { PublicKey } from '@solana/web3.js';
import {
  changeAdmin,
  getGlobalInfo,
  initProject,
  initializeUserPool,
  setClusterConfig,
  getUserInfo,
  changeConfig,
  sweepVaultFunds,
  buyWithSol,
  buyWithUsdt,
  claimToken,
} from './scripts';

// program.version('0.0.1');

programCommand('status')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { env, keypair, rpc } = cmd.opts();

    console.log('Solana Cluster:', env);
    console.log('Keypair Path:', keypair);
    console.log('RPC URL:', rpc);
    await setClusterConfig(env, keypair, rpc);

    console.log(await getGlobalInfo());
  });

programCommand('init')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .requiredOption('-min, --min_amount <number>')
  .requiredOption('-max, --max_amount <number>')
  .requiredOption('-st, --start_date <number>')
  .requiredOption('-en, --end_date <number>')
  .requiredOption('-ps, --price_with_sol <number>')
  .requiredOption('-pu, --price_with_usdt <number>')
  .requiredOption('-pc, --price_with_usdc <number>')
  .action(async (directory, cmd) => {
    const {
      env,
      keypair,
      rpc,
      min_amount,
      max_amount,
      start_date,
      end_date,
      price_with_sol,
      price_with_usdt,
      price_with_usdc,
    } = cmd.opts();

    console.log('Solana Cluster:', env);
    console.log('Keypair Path:', keypair);
    console.log('RPC URL:', rpc);

    await setClusterConfig(env, keypair, rpc);

    await initProject(
      Number(min_amount),
      Number(max_amount),
      Number(price_with_sol),
      Number(price_with_usdt),
      Number(price_with_usdc),
      Number(start_date),
      Number(end_date)
    );
  });

programCommand('change-admin')
  .requiredOption('-a, --new_admin <string>', 'new admin address')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { env, keypair, rpc, new_admin } = cmd.opts();

    console.log('Solana Cluster:', env);
    console.log('Keypair Path:', keypair);
    console.log('RPC URL:', rpc);
    await setClusterConfig(env, keypair, rpc);

    //  update global info
    await changeAdmin(new_admin);
  });

programCommand('change-config')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .option('-min, --min_amount <number>')
  .option('-max, --max_amount <number>')
  .option('-st, --start_date <number>')
  .option('-en, --end_date <number>')
  .option('-ps, --price_with_sol <number>')
  .option('-pu, --price_with_usdt <number>')
  .option('-pc, --price_with_usdc <number>')
  .action(async (directory, cmd) => {
    const {
      env,
      keypair,
      rpc,
      min_amount,
      max_amount,
      start_date,
      end_date,
      price_with_sol,
      price_with_usdt,
      price_with_usdc,
    } = cmd.opts();

    console.log('Solana Cluster:', env);
    console.log('Keypair Path:', keypair);
    console.log('RPC URL:', rpc);

    await setClusterConfig(env, keypair, rpc);

    await changeConfig(
      min_amount ? Number(min_amount) : undefined,
      max_amount ? Number(max_amount) : undefined,
      price_with_sol ? Number(price_with_sol) : undefined,
      price_with_usdt ? Number(price_with_usdt) : undefined,
      price_with_usdc ? Number(price_with_usdc) : undefined,
      start_date ? Number(start_date) : undefined,
      end_date ? Number(end_date) : undefined
    );
  });

programCommand('sweep')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { env, keypair, rpc } = cmd.opts();

    console.log('Solana Cluster:', env);
    console.log('Keypair Path:', keypair);
    console.log('RPC URL:', rpc);
    await setClusterConfig(env, keypair, rpc);

    await sweepVaultFunds();
  });

programCommand('buy-sol')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .requiredOption('-m, --amount <number>')
  .action(async (directory, cmd) => {
    const { env, keypair, rpc, amount } = cmd.opts();

    console.log('Solana Cluster:', env);
    console.log('Keypair Path:', keypair);
    console.log('RPC URL:', rpc);

    await setClusterConfig(env, keypair, rpc);

    await buyWithSol(Number(amount));
  });

programCommand('buy-usdt')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .requiredOption('-m, --amount <number>')
  .action(async (directory, cmd) => {
    const { env, keypair, rpc, amount } = cmd.opts();

    console.log('Solana Cluster:', env);
    console.log('Keypair Path:', keypair);
    console.log('RPC URL:', rpc);

    await setClusterConfig(env, keypair, rpc);

    await buyWithUsdt(Number(amount));
  });

programCommand('buy-usdc')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .requiredOption('-m, --amount <number>')
  .action(async (directory, cmd) => {
    const { env, keypair, rpc, amount } = cmd.opts();

    console.log('Solana Cluster:', env);
    console.log('Keypair Path:', keypair);
    console.log('RPC URL:', rpc);

    await setClusterConfig(env, keypair, rpc);

    await buyWithUsdt(Number(amount));
  });

programCommand('claim')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { env, keypair, rpc, claim } = cmd.opts();

    console.log('Solana Cluster:', env);
    console.log('Keypair Path:', keypair);
    console.log('RPC URL:', rpc);

    await setClusterConfig(env, keypair, rpc);

    await claimToken();
  });

programCommand('user-status')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .requiredOption('-a, --user_address <string>')
  .action(async (directory, cmd) => {
    const { env, keypair, rpc, user_address } = cmd.opts();

    console.log('Solana Cluster:', env);
    console.log('Keypair Path:', keypair);
    console.log('RPC URL:', rpc);

    await setClusterConfig(env, keypair, rpc);

    await getUserInfo(new PublicKey(user_address));
  });

programCommand('init-user')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { env, keypair, rpc } = cmd.opts();

    console.log('Solana Cluster:', env);
    console.log('Keypair Path:', keypair);
    console.log('RPC URL:', rpc);

    await setClusterConfig(env, keypair, rpc);

    await initializeUserPool();
  });

function programCommand(name: string) {
  return (
    program
      .command(name)
      .option('-e, --env <string>', 'Solana cluster env name', 'mainnet-beta') //mainnet-beta, testnet, devnet
      .option(
        '-r, --rpc <string>',
        'Solana cluster RPC name',
        'https://devnet.helius-rpc.com/?api-key=44b7171f-7de7-4e68-9d08-eff1ef7529bd'
        // 'https://flashy-cosmological-pallet.solana-mainnet.quiknode.pro/86e2f4bc350a6fb8dbcb110df4d030a205455f70/'
      )
      // .option('-r, --rpc <string>', 'Solana cluster RPC name', 'https://mainnet.helius-rpc.com/?api-key=99c6d984-537e-4569-955b-5e4703b73c0d')
      .option(
        '-k, --keypair <string>',
        'Solana wallet Keypair Path',
        './deploy.json'
      )
  );
}

program.parse(process.argv);

/*

yarn script init
yarn script change-admin -n J9ja5QkewwMi9kG6JkCNxfLK9CoDGk3F4hZTNKQaKZe3
yarn script lock -m BV3bvkBqVawTghH4uCaba3MGgYs63XyxwX9CeULwvmKG

https://solana-mainnet.g.alchemy.com/v2/wsOJ8IVuGPfyljRfcZjpLrsVQu0_of-j

yarn script unlock -m AXXfo3sggcMLNvz3zRS2wJz8xy78DFbxmgcsUYkM5TzQ -k ../key/G2.json

yarn script user-status -a G2sc5mU3eLRkbRupnupzB3NTzZ85bnc9L1ReAre9dzFU
yarn script user-status -a 4EjZ4sGnvfLbW89AAzSehob7Rmkym7vCH3SMcThSx9q1

yarn script get-users
yarn script status

*/

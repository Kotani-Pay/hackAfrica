const Stellar = require("stellar-sdk");
const { TimeoutInfinite } = require("stellar-base");
const util = require("util");
const pairs = require("./accounts.json");

const server = new Stellar.Server("https://horizon-testnet.stellar.org");

// CHECK ACCOUNT BALANCE
exports.checkAccountBalance = async pairs => {
  const accounts = await Promise.all(
    pairs.map(async pair => await server.loadAccount(pair.publicKey))
  );

  return accounts.map(account => ({
    accountId: account.id,
    balances: account.balances.map(balance => ({
      type: balance.asset_type,
      balance: balance.balance
    }))
  }));
};

// checkAccounts(pairs)
//   .then(accounts => console.log(util.inspect(accounts, false, null)))
//   .catch(e => {
//     console.error(e);
//     throw e;
//   });



  // TRANSFER FUNDS
  exports.transferFunds = async (pairA, pairB, asset, amount) => {
    const standardTxFee = await server.fetchBaseFee();
  
    const txOptions = {
      fee: standardTxFee,
      networkPassphrase: Stellar.Networks.TESTNET
    };
  
    const paymentToB = {
      destination: pairB.publicKey,
      asset,
      amount
    };
  
    const accountA = await server.loadAccount(pairA.publicKey);
  
    const transaction = new Stellar.TransactionBuilder(accountA, txOptions)
      .addOperation(Stellar.Operation.payment(paymentToB))
      .addMemo(Stellar.Memo.text("Test Transaction"))
      .setTimeout(TimeoutInfinite)
      .build();
  
    const StellarPairA = Stellar.Keypair.fromSecret(pairA.secret);
  
    transaction.sign(StellarPairA);
  
    await server.submitTransaction(transaction);
  };
  
//   const [pairA, pairB] = pairs;
  
//   transferFunds(pairA, pairB, Stellar.Asset.native(), "100.0000000")
//     .then(() => console.log("ok"))
//     .catch(e => {
//       console.error(e);
//       throw e;
//     });
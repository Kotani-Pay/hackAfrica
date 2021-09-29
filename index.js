'use strict';

// Firebase init
 const functions = require('firebase-functions');
 const admin = require('firebase-admin');
 const serviceAccount = require("./config/serviceAccountKey.json");
 const { checkAccountBalance, transferFunds } = require('./stellarLibraries')

 admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABSE_URL
 });

 const firestore = admin.firestore(); 

const express = require('express');
 const cors = require('cors');
 const moment = require('moment');
 const { ussdRouter } = require ('ussd-router');

 const app = express().use(cors({ origin: true }));

const PNF = require('google-libphonenumber').PhoneNumberFormat;
 const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();


var { getTxidUrl, getPinFromUser, createcypher, sendMessage, sendGmail } = require('./utilities');

//GLOBAL ENV VARIABLES
const iv = functions.config().env.crypto_iv.key;
const enc_decr_fn = functions.config().env.algo.enc_decr;
const  phone_hash_fn = functions.config().env.algo.msisdn_hash;
const escrowMSISDN = functions.config().env.escrow.msisdn;

//@task imports from celokit

const {  sendcUSD,  } = require('./celokit');
const { getIcxUsdtPrice } = require('./iconnect');

// USSD API 
app.post("/", async (req, res) => {
  res.set('Content-Type: text/plain');
  try{
    let newUserPin = '';
    let confirmUserPin = '';
    let documentType = '';
    let documentNumber = '';
    let firstname = '';
    let lastname = '';
    let dateofbirth = '';
    let email = '';

    // const { sessionId, serviceCode, phoneNumber, text } = req.body;
    const { body: { phoneNumber: phoneNumber } } = req;
    const { body: { text: rawText } } = req; 
    const text = ussdRouter(rawText);
    const footer = '\n0: Home 00: Back';
    let msg = '';
    
    let senderMSISDN = phoneNumber.substring(1);
    let senderId = await getSenderId(senderMSISDN);
    // console.log('senderId: ', senderId);   
    var data = text.split('*'); 
    let userExists = await checkIfSenderExists(senderId);
    // console.log("Sender Exists? ",userExists);
    if(!userExists){       
      let userCreated = await createNewUser(senderId, senderMSISDN);     
      console.log('Created user with userID: ', userCreated); 
      // msg += `END Creating your account on KotaniPay`; 
    }

    let isverified = await checkIfUserisVerified(senderId);    
    if(!isverified){
      if ( data[0] == null || data[0] == ''){
        msg = `CON Welcome to KotaniPay. \nKindly Enter your details to verify your account.\n\nEnter new PIN`;
        res.send(msg);
      }else if ( data[0] !== '' && data[1] == null ){
        msg = `CON Reenter PIN to confirm`;
        res.send(msg);
      }else if ( data[0] !== '' && data[1] !== ''  && data[2] == null ) {
        confirmUserPin = data[1];
        // console.log('confirmation PIN ', confirmUserPin);

        msg = `CON Enter ID Document Type:\n1. National ID \n2. Passport \n3. AlienID`;
        res.send(msg);
      }else if ( data[0] !== '' && data[1] !== '' && data[2] !== ''  && data[3] == null){ 
        if(data[2]==='1'){documentType = 'ID'}
        else if (data[2]==='2'){documentType = 'Passport'}
        else if (data[2]==='3'){documentType = 'AlienID'}
        else{documentType = 'ID'}

        msg = `CON Enter ${documentType} Number`;
        res.send(msg);
      }else if ( data[0] !== '' && data[1] !== '' && data[2] !== ''  && data[3] !== ''  && data[4] == null){ //data[0] !== null && data[0] !== '' && data[1] == null
        documentNumber = data[3];
        // console.log(`${documentType} Number: `, documentNumber);

        msg = `CON Enter First Name`;
        res.send(msg);
      }else if ( data[0] !== '' && data[1] !== '' && data[2] !== ''  && data[3] !== ''  && data[4] !== ''  && data[5] == null){ //data[0] !== null && data[0] !== '' && data[1] == null
        firstname = data[4];
        // console.log('Firstname: ', firstname);

        msg = `CON Enter Last Name`;
        res.send(msg);
      }else if ( data[0] !== '' && data[1] !== '' && data[2] !== ''  && data[3] !== ''  && data[4] !== ''  && data[5] !== '' && data[6] == null){ //data[0] !== null && data[0] !== '' && data[1] == null
        lastname = data[5];
        // console.log('Lastname: ', lastname);

        msg = `CON Enter Date of Birth.\nFormat: YYYY-MM-DD`;
        res.send(msg);
      }else if ( data[0] !== '' && data[1] !== '' && data[2] !== ''  && data[3] !== ''  && data[4] !== '' && data[5] !== '' && data[6] !== '' && data[7] == null){ //data[0] !== null && data[0] !== '' && data[1] == null
        dateofbirth = data[6];
        // console.log('DateOfBirth: ', dateofbirth);

        msg = `CON Enter Email Address`;
        res.send(msg);
      }else if ( data[0] !== '' && data[1] !== '' && data[2] !== ''  && data[3] !== ''  && data[4] !== '' && data[5] !== '' && data[6] !== ''  && data[7] !== '' && data[8] == null){ //data[0] !== null && data[0] !== '' && data[1] == null
        email = data[7];
        msg = `CON By accessing this app you agree to the terms and conditions.\nhttps://kotanipay.com/terms.html \nSelect: \n1. Agree. \n2. Disagree`;
        res.send(msg);
      }else if ( data[0] !== '' && data[1] !== '' && data[2] !== ''  && data[3] !== ''  && data[4] !== '' && data[5] !== '' && data[6] !== ''  && data[7] !== '' && data[8] == '1'){
        newUserPin = data[0];
        confirmUserPin = data[1];
        documentType = data[2];
        documentNumber = data[3];
        firstname = data[4];
        lastname = data[5];
        dateofbirth = data[6];
        email = data[7];
        

        
        let userMSISDN = phoneNumber.substring(1);
        let userId = await getSenderId(userMSISDN);  
        let enc_loginpin = await createcypher(newUserPin, userMSISDN, iv);
        let isvalidEmail = await validEmail(email);
        console.log('isValidEmail: ', isvalidEmail);
        if(!isvalidEmail){
          msg = `CON The email address: ${email} is not valid \nRetry again`;
          res.send(msg);
          return;
        }
        console.log(`User Details=> ${userMSISDN} : ${userId} : ${newUserPin} : ${confirmUserPin} : ${documentType} : ${documentNumber} : ${firstname} : ${lastname} : ${dateofbirth} : ${email} : ${enc_loginpin}`);
        
        if(newUserPin === confirmUserPin && newUserPin.length >= 4 ){
          msg = `END Thank You. \nYour Account Details will be verified shortly`;
          res.send(msg);

          //KYC USER
          try{
            let kycdata = {
              "documentType" : documentType,
              "documentNumber" : documentNumber,
              "dateofbirth" : dateofbirth,
              "fullName" : `${firstname} ${lastname}`
            }

            //Update User account and enable
            let updateinfo = await verifyNewUser(userId, email, newUserPin, enc_loginpin, firstname, lastname, documentNumber, dateofbirth, userMSISDN);
            await firestore.collection('hashfiles').doc(userId).set({'enc_pin' : `${enc_loginpin}`}); 

            // console.log('User data updated successfully: \n',JSON.stringify(updateinfo));
            //save KYC data to KYC DB
            let newkycdata = await addUserKycToDB(userId, kycdata);
            await admin.auth().setCustomUserClaims(userId, {verifieduser: true})
            let message2sender = `Welcome to Kotani Pay.\nYour account details have been verified.\nDial *483*354# to access the service.\nUser PIN: ${newUserPin}`;
            sendMessage("+"+userMSISDN, message2sender);


          }catch(e){console.log('KYC Failed: No data received'+e)}
        }
        else if (newUserPin.length < 4 ){
          console.log('KYC Failed')
          msg = `END PIN Must be atleast 4 characters,\n RETRY again`;
          res.send(msg);
          return;
        }
        else if (newUserPin !== confirmUserPin){
          msg = `END Your access PIN does not match,\n RETRY again`; //${newUserPin}: ${confirmUserPin}
          res.send(msg);
          return;
        }
      }else if ( data[0] !== '' && data[1] !== '' && data[2] !== ''  && data[3] !== ''  && data[4] !== '' && data[5] !== '' && data[6] !== ''  && data[7] !== '' && data[8] == '2'){
        msg = `END Accept the terms & conditions to access Kotani Pay services`;
        res.send(msg);
        return;
      }
    }    

    else if (text === '' ) {
      msg = 'CON Welcome to Kotani Pay:';
      msg += '\n1: Send Money';
      msg += '\n5: Kotani DEx';
      msg += '\n7: My Account';
      res.send(msg);
    }     
      
    //  1. TRANSFER FUNDS #SEND MONEY
    else if ( data[0] == '1' && data[1] == null) { 
      msg = `CON Select Option`;
      msg += `\n1. Send to PhoneNumber`;
      msg += `\n2. Send to Wallet Address`;
      msg += footer;
      res.send(msg);
    }else if ( data[0] == '1' && data[1] == '1' && data[2] == null) { 
      msg = `CON Enter Recipient`;
      msg += footer;
      res.send(msg);
    } else if ( data[0] == '1' && data[1] == '1' && data[2] !== '' && data[3] == null) {  //  TRANSFER && PHONENUMBER
      msg = `CON Enter Amount to Send:`;
      msg += footer;
      res.send(msg);
        
    } else if ( data[0] == '1' && data[1] == '1' && data[2] !== '' && data[3] !== '' ) {//  TRANSFER && PHONENUMBER && AMOUNT
      senderMSISDN = phoneNumber.substring(1);
      let receiverMSISDN;
      try { receiverMSISDN = phoneUtil.format(phoneUtil.parseAndKeepRawInput(`${data[2]}`, 'KE'), PNF.E164) } catch (e) { console.log(e) }

      receiverMSISDN = receiverMSISDN.substring(1);  
      let amount = data[3];
      let cusdAmount = parseFloat(amount);
      cusdAmount = cusdAmount*0.0091;
      let senderId = await getSenderId(senderMSISDN)
      let recipientId = await getRecipientId(receiverMSISDN)

      let recipientstatusresult = await checkIfRecipientExists(recipientId);
      if(recipientstatusresult == false){ 
        let recipientUserId = await createNewUser(recipientId, receiverMSISDN); 
        console.log('New Recipient', recipientUserId);
      }  
      
      // Retrieve User Blockchain Data
      let senderInfo = await getSenderDetails(senderId);
      let senderprivkey = await getSenderPrivateKey(senderInfo.data().seedKey, senderMSISDN, iv)

      let receiverInfo = await getReceiverDetails(recipientId);
      while (receiverInfo.data() === undefined || receiverInfo.data() === null || receiverInfo.data() === ''){
        await sleep(1000);
        receiverInfo = await getReceiverDetails(recipientId);
        // console.log('Receiver:', receiverInfo.data());
      }

      let senderName = '';
      await admin.auth().getUser(senderId).then(user => { senderName = user.displayName; return; }).catch(e => {console.log(e)})  
      console.log('Sender fullName: ', senderName);

      let receiverName = '';
      await admin.auth().getUser(recipientId).then(user => { receiverName = user.displayName; return; }).catch(e => {console.log(e)})  
      console.log('Receiver fullName: ', receiverName);

      // if(receiverName==undefined || receiverName==''){_receiver=receiverMSISDN; } else{ _receiver=receiverName;}
      let _receiver = await getReceiverName(receiverMSISDN);
      

      const [pairA, pairB] = [{address: senderAddress, secret: senderprivkey}, {address: receiverAddress, secret: receiverPrivkey}];  
      let receipt = transferFunds(pairA, pairB, Stellar.Asset.native(), amount).then(() => console.log("ok")).catch(e => { console.error(e);  throw e; });

      if(receipt === 'failed'){
        msg = `END Your transaction has failed due to insufficient balance`;  
        res.send(msg);
        return;
      }

      

      let url = await getTxidUrl(receipt.transactionHash);
      let message2sender = `KES ${amount}  sent to ${_receiver}.\nTransaction URL:  ${url}`;
      let message2receiver = `You have received KES ${amount} from ${senderName}.\nTransaction Link:  ${url}`;
      console.log('tx URL', url);
      msg = `END KES ${amount} sent to ${_receiver}. \nTransaction Details: ${url}`;  
      res.send(msg);

      sendMessage("+"+senderMSISDN, message2sender);
      sendMessage("+"+receiverMSISDN, message2receiver);        
    } 

    //Transfer to Address
    else if ( data[0] == '1' && data[1] == '2' && data[2] == '1' && data[3] == null) { 
      msg = `CON Enter Recipients Address`;
      msg += footer;
      res.send(msg);
    } else if ( data[0] == '1' && data[1] == '2' && data[2]!== '' && data[3] == null) {  //  TRANSFER && ADDRESS
      msg = `CON Enter Amount to Send:`;
      msg += footer;
      res.send(msg);
        
    } else if ( data[0] == '1' && data[1] == '2' && data[2] !== '' && data[3] !== '' ) {//  TRANSFER && ADDRESS && AMOUNT
      let senderMSISDN = phoneNumber.substring(1);
      let receiverAddress = `${data[1]}`; 
      let amount = data[3];
      let senderId = await getSenderId(senderMSISDN)
      let senderInfo = await getSenderDetails(senderId);
      let senderprivkey = await getSenderPrivateKey(senderInfo.data().seedKey, senderMSISDN, iv)  
      
      const [pairA, pairB] = [{address: senderAddress, secret: senderprivkey}, {address: receiverAddress, secret: receiverPrivkey}];  
      let receipt = transferFunds(pairA, pairB, Stellar.Asset.native(), amount).then(() => console.log("ok")).catch(e => { console.error(e);  throw e; });

      if(receipt === 'failed'){
        msg = `END Your transaction has failed due to insufficient balance`;  
        res.send(msg);
        return;
      }

      let url = await getTxidUrl(receipt.transactionHash);
      let message2sender = `KES ${amount}  sent to ${receiverAddress}.\nTransaction URL:  ${url}`;
      console.log('tx URL', url);
      msg = `END KES ${amount} sent to ${_receiver}. \nTransaction Details: ${url}`;  
      res.send(msg);

      sendMessage("+"+senderMSISDN, message2sender);      
    }
    



    //  5. KOTANI DEX
    else if ( data[0] == '5' && data[1] == null) {
      // Business logic for first level msg
      msg = `CON Choose Investment Option
      1. Buy/Sell CELO
      2. Buy/Sell BTC
      3. Buy/Sell ETH
      4. Buy/Sell ICX`;
      msg += footer;
      res.send(msg);
    }
    
    //KES TRADING
    else if ( data[0] == '5' && data[1] == '1' && data[2] == null) {
        let userMSISDN = phoneNumber.substring(1);      
        msg = 'CON Choose CELO Option:';
        msg += '\n1: Buy CELO';
        msg += '\n2: Sell CELO';
        msg += footer;    
        res.send(msg);  
    }else if ( data[0] == '5' && data[1] == '1' && data[2] == '1' && data[3] == null) { //Buy Celo
      let userMSISDN = phoneNumber.substring(1); 
      let celoKesPrice = 200;     
      msg = `CON Current CELO price is Ksh. ${celoKesPrice}.\nEnter Ksh Amount to Spend`;    //await getAccDetails(userMSISDN);   
      msg += footer;  
      res.send(msg);   
    }else if ( data[0] == '5' && data[1] == '1' && data[2] == '1' && data[3] !== '') { //Buy Celo
      let userMSISDN = phoneNumber.substring(1); 
      let amount2spend = number_format(data[2],2);
      let celoKesPrice = 200;  
      let celoUnits = amount2spend/celoKesPrice;
      // buyCelo(address, cusdAmount, privatekey)
      msg = `END Purchasing ${number_format(celoUnits,2)} CELO at Ksh. ${celoKesPrice} per Unit `;    //await getAccDetails(userMSISDN);   
      // msg += footer;  
      res.send(msg);   
    }
    
    else if ( data[0] == '5' && data[1] == '1' && data[2] == '2' && data[3] == null) { //Sell Celo
      let userMSISDN = phoneNumber.substring(1); 
      let celoKesPrice = 200;     
      msg = `CON Current CELO price is Ksh. ${celoKesPrice}.\nEnter Ksh Amount to Spend`;    //await getAccDetails(userMSISDN);   
      msg += footer;  
      res.send(msg);   
    }else if ( data[0] == '5' && data[1] == '1' && data[2] == '2' && data[3] !== '') { //Sell Celo
      let userMSISDN = phoneNumber.substring(1); 
      let celoUnits = number_format(data[2],2);
      let celoKesPrice = 200;  
      let amount2receive = celoUnits*celoKesPrice;
      // sellCelo(address, celoAmount, privatekey)   
      msg = `END Selling ${number_format(celoUnits,2)} CELO at Ksh. ${celoKesPrice} per Unit `;    //await getAccDetails(userMSISDN);   
      // msg += footer;  
      res.send(msg);   
    }

    
    //BTC TRADING
    else if ( data[0] == '5'  && data[1] == '2' && data[2] == null) {
        let userMSISDN = phoneNumber.substring(1);
        msg = `CON BTC Trading Coming soon`;
        msg += footer; 
        res.send(msg);
    }else if ( data[0] == '5'  && data[1] == '3' && data[2] == null) {
      let userMSISDN = phoneNumber.substring(1);
      msg = `CON ETH Trading Coming soon`; 
      msg += footer;   
      res.send(msg);    
    }else if ( data[0] == '5'  && data[1] == '4' && data[2] == null) {
      let userMSISDN = phoneNumber.substring(1);
      msg = `CON Choose ICX Option
          1. Check ICX/USD Current Price
          2. Market Buy ICX
          3. Limit Buy ICX
          4. Market Sell ICX
          5. Limit Sell ICX`;
      msg += footer;   
      res.send(msg);     
    }
    //1. Get XLM Current Price
    else if ( data[0] == '5'  && data[1] == '4' && data[2] == '1' ) {
      let userMSISDN = phoneNumber.substring(1);

      let icxprice = await getIcxUsdtPrice();
        console.log('Todays ICX Price=> ', icxprice);

      msg = `CON Current ICX Price is:\nUSD ${icxprice.price}`;
      msg += footer;
      res.send(msg);
    }
    //2. Market Buy XLM
    else if ( data[0] == '5'  && data[1] == '4' && data[2] == '2' && data[3] == null ) {
      let userMSISDN = phoneNumber.substring(1);

      let icxprice = await getIcxUsdtPrice();
        console.log('Todays ICX Price=> ', icxprice);
      msg = `CON Enter ICX Amount:`;
      msg += footer;
      res.send(msg);

    }else if ( data[0] == '5'  && data[1] == '4' && data[2] == '2' && data[3] !== '') { //2.1: Market Buy amount
      let userMSISDN = phoneNumber.substring(1);
      let amount = data[3]
      let icxprice = await getIcxUsdtPrice();
        console.log('Todays ICX Price=> ', icxprice);
      msg = `CON Buying ${amount} ICX @ USD ${icxprice.price}`;
      msg += footer;
      res.send(msg);
    }
    //3. Limit Buy XLM
    else if ( data[0] == '5'  && data[1] == '4' && data[2] == '3' && data[3] == null ) {
      let userMSISDN = phoneNumber.substring(1);

      //let icxprice = await getIcxUsdtPrice();
        //console.log('Todays ICX Price=> ', icxprice);
      msg = `CON Enter ICX Amount:`;
      msg += footer;
      res.send(msg);

    }else if ( data[0] == '5'  && data[1] == '4' && data[2] == '3' && data[3] !== '' && data[4] == null) { //3. Limit Buy ICX
      let userMSISDN = phoneNumber.substring(1);
      let amount = data[3];
      let icxprice = await getIcxUsdtPrice();
        console.log('Todays ICX Price=> ', icxprice);

      msg = `CON Current ICX mean Price: USD ${icxprice.price} \nBuying ${amount} ICX \n Enter your Price in USD`;
      msg += footer;
      res.send(msg);
    }else if ( data[0] == '5'  && data[1] == '4' && data[2] == '3' && data[3] !== '' && data[4] !== '') { //3.1. Limit Buy ICX
      let userMSISDN = phoneNumber.substring(1);
      let amount = data[3];

      // let icxprice = await getIcxUsdtPrice();
      let limitbuyprice = data[4];
        // console.log('Todays ICX Price=> ', icxprice);

      msg = `END Buying ${amount} ICX @ USD ${limitbuyprice}`;
      res.send(msg);
    }


    //  7. ACCOUNT DETAILS
    else if ( data[0] == '7' && data[1] == null) {
      // Business logic for first level msg
      msg = `CON Choose account information you want to view`;
      msg += `\n1. Account Details`;
      msg += `\n2. Account Balance`;
      msg += `\n3. Account Backup`;
      msg += `\n4. PIN Reset`
      msg += footer;
      res.send(msg);
    }else if ( data[0] == '7' && data[1] == '1') {
      let userMSISDN = phoneNumber.substring(1);
      msg = await getAccDetails(userMSISDN);  
      res.send(msg);      
    }else if ( data[0] == '7'  && data[1] == '2') {
      let userMSISDN = phoneNumber.substring(1);
      msg = await getAccBalance(userMSISDN);  
      res.send(msg);      
    }else if ( data[0] == '7'  && data[1] == '3') {
      let userMSISDN = phoneNumber.substring(1);
      msg = await getSeedKey(userMSISDN); 
      res.send(msg);       
    }else if ( data[0] == '7'  && data[1] == '4') {
      let userMSISDN = phoneNumber.substring(1);
      let userId = await getSenderId(userMSISDN)
      try{
        let userEmail = '';
        await admin.auth().getUser(userId).then(user => { userEmail = user.email; return; }).catch(e => {console.log(e)}) 
        console.log('User Email: ', userEmail, 'userId: ',userId); 
        
        let newUserPin = await getPinFromUser();
        let enc_loginpin = await createcypher(newUserPin, userMSISDN, iv);
        await firestore.collection('hashfiles').doc(userId).update({'enc_pin' : `${enc_loginpin}`})  
        const message = `Your KotaniPay PIN has been reset to: ${newUserPin}`;
        const gmailSendOptions = {
          "user": functions.config().env.gmail.user,
          "pass": functions.config().env.gmail.pass,
          "to": userEmail,
          "subject": "Kotani Pay PIN"
        }
        sendGmail(gmailSendOptions, message);
        msg = `END Password reset was successful.\n Kindly check ${userEmail} for Details`; 
        res.send(msg);
      }catch(e){
        console.log(`No Email Address`, e);
        msg = `END Password reset failed: You dont have a valid email d`; 
        res.send(msg);
      }
    }


    else{
      msg = `CON Sorry, I dont understand your option`;
      msg += 'SELECT:';
      msg += '\n1: Send Money';
      msg += '\n5: Kotani DEx';
      msg += '\n7: My Account';
      res.send(msg);
    } 
  }catch(e){console.log(JSON.stringify(e)); res.send(`END Sorry, There was a problem with your request. Try again later`)}
});

exports.kotanipay = functions.region('europe-west3').https.onRequest(app);

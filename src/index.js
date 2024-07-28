// ./src/index.js
// importing the dependencies
import { connectSdk } from "./utils/connect-sdk.js";
import { getRandomInt } from "./utils/random.js";
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

// defining the Express app
const app = express();
// defining an array to work as the database (temporary solution)
const ads = [
    { title: 'Hello, world (again)!' }
];

// adding Helmet to enhance your Rest API's security
app.use(helmet());

// using bodyParser to parse JSON bodies into JS objects
app.use(bodyParser.json());

// enabling CORS for all requests
app.use(cors());

// adding morgan to log HTTP requests
app.use(morgan('combined'));

// defining an endpoint to return all ads
app.get('/', (req, res) => {
    res.send(ads);
});

app.post("/createCar", (req, res, next) => {
    const message = req.body.message;
    createCollection();
    res.json({ "receivedMessage": message });
});

app.post("/createtoken", (req, res, next) => {
    const message = req.body.message;
    createToken();
    res.json({ "receivedMessage": message });
});

app.post("/createAchivement", (req, res, next) => {
    const message = req.body.message;
    createCollectionAchievement();
    res.json({ "receivedMessage": message });
});

app.post("/play", (req, res, next) => {
    const message = req.body.message;
    play();
    res.json({ "receivedMessage": message });
});



const createCollection = async () => {
    const { account, sdk } = await connectSdk();

    // 1. Let's check account's balance
    // NOTICE: get OPL tokens https://t.me/unique2faucet_opal_bot
    const balance = await sdk.balance.get(account);
    console.log(`${account.address} balance:`, balance.availableBalance.formatted);

    // 2. Mint collection
    const { parsed } = await sdk.collection.createV2({
        name: "Racing Dreams",
        description: "Racing simulation demo",
        symbol: "CAR",
        cover_image: { url: "https://gateway.pinata.cloud/ipfs/QmeNzaLfsUUi5pGmhrASEpXF52deCDuByeKbU7SuZ9toEi" },
        // NOTICE: activate nesting for collection admin in order to assign achievements
        permissions: { nesting: { collectionAdmin: true } },
        encodeOptions: {
            overwriteTPPs: [
                {
                    // tokenData is a container for attributes
                    key: 'tokenData',
                    permission: {
                        // NOTICE: limit mutability for admins only 
                        collectionAdmin: true, tokenOwner: false, mutable: true
                    }
                }
            ],
        },
    });

    if (!parsed) throw Error('Cannot parse minted collection');

    const collectionId = parsed.collectionId;
    console.log('Collection ID:', collectionId);
    console.log(`Explore your collection: https://uniquescan.io/opal/collections/${collectionId}`);

    process.exit(0);
}

const createToken = async () => {
    const args = process.argv.slice(2);
    if (args.length < 3) {
      console.error("run this command: node ./src/3-create-car.js {collectionId} {address} {nickname}");
      process.exit(1);
    }
  
    const [collectionId, owner, nickname] = args;
  
    const {account, sdk} = await connectSdk();
  
    // Get pseudo-random car image for fun
    const tokenImage = getRandomInt(2) === 0
      ? "https://gateway.pinata.cloud/ipfs/QmfWKy52e8pyH1jrLu4hwyAG6iwk6hcYa37DoVe8rdxXwV"
      : "https://gateway.pinata.cloud/ipfs/QmNn6jfFu1jE7xPC2oxJ75kY1RvA2tz9bpQDsqweX2kDig"
  
    const tokenTx = await sdk.token.createV2({
      collectionId,
      image: tokenImage,
      owner,
      attributes: [
        {
          trait_type: "Nickname",
          value: nickname,
        },
        {
          trait_type: "Victories",
          value: 0,
        },
        {
          trait_type: "Defeats",
          value: 0,
        }
      ],
    });
  
    const token = tokenTx.parsed;
    if (!token) throw Error("Cannot parse token");
  
    console.log(`Explore your NFT: https://uniquescan.io/opal/tokens/${token.collectionId}/${token.tokenId}`);
   
    process.exit(0);
  }

const createCollectionAchievement = async () => {
    const {sdk} = await connectSdk();
  
    const {parsed} = await sdk.collection.createV2({
      name: "Racing Dreams Achievements",
      description: "Achievements for Racing simulation demo",
      symbol: "ACH",
      cover_image: {url: "https://gateway.pinata.cloud/ipfs/QmWm5mPjmWqFvF2wyXbheumBWoEQpWm1f9GqGQfLfBYbDi"},
      // NOTICE: activate nesting in order to assign achievements
      permissions: {nesting: {collectionAdmin: true}},
      encodeOptions: {
        // NOTICE: we do not want to mutate tokens of the Achievements collection
        defaultPermission: {collectionAdmin: true, tokenOwner: false, mutable: false},
      }
    });
  
    if(!parsed) throw Error('Cannot parse minted collection');
    
    const collectionId = parsed.collectionId;
    console.log(`Explore your collection: https://uniquescan.io/opal/collections/${collectionId}`);
  
    process.exit(0);
  }  

const play = async () => {
    const args = process.argv.slice(2);
    if (args.length < 4) {
      console.error("run this command: node ./src/4-play.js {collectionId-cars} {collectionId-achievements} {tokenId-1} {tokenId-2}");
      process.exit(1);
    }
  
    const [carsCollectionId, achievementsCollectionId, tokenId1, tokenId2] = args;
    const {account, sdk} = await connectSdk();
  
    // Pick the winner 
    const random = getRandomInt(2);
    const [winner, loser] = random === 0 ? [tokenId1, tokenId2] : [tokenId2, tokenId1];
    console.log(`Winner is ${winner}`);
  
    // 
    let {nonce} = await sdk.common.getNonce(account);
    const transactions = [];
  
    ////////////////////////////////////////////////////////
    ///////////////////// WINNER CALLS /////////////////////
    ////////////////////////////////////////////////////////
  
    // 1. Increment Victories to Winner
    const winnerToken = await sdk.token.getV2({collectionId: carsCollectionId, tokenId: winner});
    const winnerVictories = winnerToken.attributes.find(a => a.trait_type === "Victories").value;
  
    transactions.push(sdk.token.setProperties({
      collectionId: carsCollectionId,
      tokenId: winner,
      // NOTICE: Attributes stored in "tokenData" property
      properties: [{
        key: "tokenData",
        value: changeAttribute(winnerToken, "Victories", winnerVictories + 1)
      }]
    }, { nonce: nonce++}));
  
    // 2. If this is the first win - give an achievment
    if (winnerVictories + 1 === 1) {
      transactions.push(sdk.token.createV2({
        collectionId: achievementsCollectionId,
        image: "https://gateway.pinata.cloud/ipfs/QmY7hbSNiwE3ApYp83CHWFdqrcEAM6AvChucBVA6kC1e8u",
        attributes: [{trait_type: "Bonus", value: 10}],
        // NOTICE: owner of the achievment NFT is car NFT
        owner: Address.nesting.idsToAddress(winnerToken.collectionId, winnerToken.tokenId),
      }, {nonce: nonce++}));
    }
  
    ////////////////////////////////////////////////////////
    ///////////////////// LOSER CALLS //////////////////////
    ////////////////////////////////////////////////////////
  
    const loserToken = await sdk.token.getV2({collectionId: carsCollectionId, tokenId: loser});
    const loserDefeats = loserToken.attributes.find(a => a.trait_type === "Defeats").value;
  
    // 3. Increment Defeats to Loser
    transactions.push(sdk.token.setProperties({
      collectionId: carsCollectionId,
      tokenId: loser,
      // NOTICE: Attributes stored in "tokenData" property
      properties: [{
        key: "tokenData",
        value: changeAttribute(loserToken, "Defeats", loserDefeats + 1)
      }]
    }, {nonce: nonce++}));
  
    // 4. If this is the first defeat - give an achievment
    if (loserDefeats + 1 === 1) {
      transactions.push(sdk.token.createV2({
        collectionId: achievementsCollectionId,
        image: "https://gateway.pinata.cloud/ipfs/QmP2pehdeJWNK8DMMoy7Fm9QoWHZ6As159NiZ6ZSrbb64o",
        attributes: [{trait_type: "Bonus", value: 5}],
        // NOTICE: owner of the achievment NFT is car NFT
        owner: Address.nesting.idsToAddress(loserToken.collectionId, loserToken.tokenId),
      }, {nonce: nonce++}));
    }
  
    await Promise.all(transactions);
  
    console.log(`TokenID ${winner} has ${winnerVictories + 1} wins`);
    console.log(`TokenID ${loser} has ${loserDefeats + 1} defeats`);
  
    console.log(`Winner: https://uniquescan.io/opal/tokens/${carsCollectionId}/${winner}`);
    console.log(`Loser: https://uniquescan.io/opal/tokens/${carsCollectionId}/${loser}`);
  
    process.exit(0);
  }  

  


// starting the server
app.listen(3001, () => {
    console.log('listening on port 3001');
});
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import { HardhatUserConfig, task } from "hardhat/config";
import "hardhat-deploy";
import "@nomiclabs/hardhat-etherscan";
import { config as dotEnvConfig } from "dotenv";
import "solidity-coverage";
import { fillAndSign } from "./test/UserOps";
import { UserOperation } from "./test/UserOperation";
import { hexValue } from "@ethersproject/bytes";

import * as fs from "fs";
import { hexConcat, formatUnits, keccak256, arrayify, parseEther } from "ethers/lib/utils";
import {
  EntryPoint,
  SimpleAccount,
  SimpleAccountFactory,
  TestCounter,
  TokenPaymaster,
} from "./typechain";

const dotenv = require("dotenv");
dotenv.config();
dotEnvConfig();

task("accounts", "Prints the list of accounts", async (taskArgs, bre) => {
  const accounts = await bre.ethers.getSigners();
  for (let i = 0; i < accounts.length; i++) {
    let account = accounts[i];
    let address = await account.getAddress();
    console.log(
      `(${i})`,
      address,
      formatUnits(await bre.ethers.provider.getBalance(address)).toString()
    );
  }
});

task("testop", "test User ops")
  .addParam("sa", "simple account address")
  .addParam("fa", "factory address")
  .addParam("ep", "entrypoint address")
  .addParam("pm", "token paymaster address")
  .setAction(async ({ sa, ep, pm, fa }, { ethers, run, network }) => {
    const [signer, user, beneficiaryAddress] = await ethers.getSigners();
    console.log("signer:", signer.address);
    console.log(
      "balance:",
      formatUnits(await ethers.provider.getBalance(signer.address))
    );

    const entryPoint = (await ethers.getContractAt(
      "EntryPoint",
      ep,
      user
    )) as EntryPoint;

    const simpleAccount = (await ethers.getContractAt(
      "SimpleAccount",
      sa,
      user
    )) as SimpleAccount;

    const tokenPaymaster = (await ethers.getContractAt(
      "TokenPaymaster",
      pm,
      user
    )) as TokenPaymaster;

    const factory = (await ethers.getContractAt(
      "SimpleAccountFactory",
      fa,
      user
    )) as SimpleAccountFactory;

    let createOp: UserOperation;
    let counter = 0;

    const privateKey = keccak256(
      Buffer.from(arrayify(ethers.BigNumber.from(++counter)))
    );
    let accountOwner = new ethers.Wallet(privateKey, ethers.provider);

    createOp = await fillAndSign(
      {
        initCode: getAccountDeployer(
          factory,
          accountOwner.address,
          3
        ),
        verificationGasLimit: 2e6,
        paymasterAndData: tokenPaymaster.address,
        nonce: 0,
      },
      accountOwner,
      entryPoint
    );
    const preAddr = createOp.sender;
    let receipt = await tokenPaymaster.connect(signer).mintTokens(preAddr, parseEther('1'))
    receipt = await entryPoint.simulateValidation(createOp, { gasLimit: 5e6 }).catch(e => e.message)

    const rcpt = await entryPoint.handleOps([createOp], beneficiaryAddress.address, {
      gasLimit: 1e7
    }).catch().then(async tx => await tx!.wait())
    
  });

function getAccountDeployer(
  factory: SimpleAccountFactory,
  accountOwner: string,
  _salt: number = 0
): string {
  return hexConcat([
    factory.address,
    hexValue(
      factory.interface.encodeFunctionData("createAccount", [
        accountOwner,
        _salt,
      ])!
    ),
  ]);
}
const mnemonicFileName =
  process.env.MNEMONIC_FILE ??
  `${process.env.HOME}/.secret/testnet-mnemonic.txt`;
let mnemonic = "test ".repeat(11) + "junk";
if (fs.existsSync(mnemonicFileName)) {
  mnemonic = fs.readFileSync(mnemonicFileName, "ascii");
}

function getNetwork1(url: string): {
  url: string;
  accounts: { mnemonic: string };
} {
  return {
    url,
    accounts: { mnemonic },
  };
}

function getNetwork(name: string): {
  url: string;
  accounts: { mnemonic: string };
} {
  return getNetwork1(`https://${name}.infura.io/v3/${process.env.INFURA_ID}`);
  // return getNetwork1(`wss://${name}.infura.io/ws/v3/${process.env.INFURA_ID}`)
}

const optimizedComilerSettings = {
  version: "0.8.17",
  settings: {
    optimizer: { enabled: true, runs: 1000000 },
    viaIR: true,
  },
};

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.15",
        settings: {
          optimizer: { enabled: true, runs: 1000000 },
        },
      },
    ],
    overrides: {
      "contracts/core/EntryPoint.sol": optimizedComilerSettings,
      "contracts/samples/SimpleAccount.sol": optimizedComilerSettings,
    },
  },
  networks: {
    dev: { url: "http://localhost:8545" },
    // github action starts localgeth service, for gas calculations
    localgeth: { url: "http://localgeth:8545" },
    goerli: getNetwork("goerli"),
    sepolia: getNetwork("sepolia"),
    proxy: getNetwork1("http://localhost:8545"),
    metertest: {
      url: "https://rpctest.meter.io",
      chainId: 83,
      timeout: 99999,
      gasPrice: 500000000000,
      accounts: { mnemonic: process.env.MNEMONIC },
      // accounts: [
      //   process.env.PRIVATE_KEY_0,
      //   process.env.PRIVATE_KEY_1,
      //   process.env.PRIVATE_KEY_2,
      //   process.env.PRIVATE_KEY_3,
      // ],
    },
  },
  mocha: {
    timeout: 10000,
  },

  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

// coverage chokes on the "compilers" settings
if (process.env.COVERAGE != null) {
  // @ts-ignore
  config.solidity = config.solidity.compilers[0];
}

export default config;

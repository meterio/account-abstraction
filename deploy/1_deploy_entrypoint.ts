import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Create2Factory } from "../src/Create2Factory";
import { ethers } from "hardhat";

const deployEntryPoint: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const provider = ethers.provider;
  const from = await provider.getSigner().getAddress();
  await new Create2Factory(ethers.provider).deployFactory();
  // EntryPoint
  const entryPoint = await hre.deployments.deploy("EntryPoint", {
    from,
    args: [],
    gasLimit: 6e6,
    deterministicDeployment: false,
  });
  console.log("==entryPoint addr=", entryPoint.address);

  // SimpleAccount
  const simpleAccount = await hre.deployments.deploy("SimpleAccount", {
    from,
    args: [entryPoint.address],
    gasLimit: 6e6,
    deterministicDeployment: false,
  });
  console.log("==wallet=", simpleAccount.address);

  // TestCounter
  const testCounter = await hre.deployments.deploy("TestCounter", {
    from,
    deterministicDeployment: false,
  });
  console.log("==testCounter=", testCounter.address);

  // SimpleAccountFactory
  const simpleAccountFactory = await hre.deployments.deploy(
    "SimpleAccountFactory",
    {
      from,
      args: [simpleAccount.address],
      gasLimit: 6e6,
      deterministicDeployment: false,
    }
  );
  console.log("==SimpleAccountFactory addr=", simpleAccountFactory.address);

  // TokenPaymaster
  const tokenPaymaster = await hre.deployments.deploy(
    "TokenPaymaster",
    {
      from,
      args: [simpleAccountFactory.address, "TTT", entryPoint.address],
      gasLimit: 6e6,
      deterministicDeployment: false,
    }
  );
  console.log("==TokenPaymaster addr=", tokenPaymaster.address);
};

export default deployEntryPoint;

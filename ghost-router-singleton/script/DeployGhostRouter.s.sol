// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { GhostRouter } from "../src/GhostRouter.sol";

contract DeployGhostRouter is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        bytes32 salt = keccak256(abi.encodePacked("GhostRouter_v0"));

        vm.startBroadcast(deployerPrivateKey);

        // 2. Deploy using CREATE2 by passing the salt parameter
        new GhostRouter{salt: salt}();

        vm.stopBroadcast();
    }
}
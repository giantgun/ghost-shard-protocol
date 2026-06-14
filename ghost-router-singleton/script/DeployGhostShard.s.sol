// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {GhostShard} from "../src/GhostShard.sol";

contract DeployGhostShard is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address routerAddress = vm.envAddress("GHOST_ROUTER_ADDRESS");

        bytes32 salt = keccak256(abi.encodePacked("GhostShard_v0"));

        vm.startBroadcast(deployerPrivateKey);

        // Deploy using CREATE2
        new GhostShard{salt: salt}(routerAddress);

        vm.stopBroadcast();
    }
}
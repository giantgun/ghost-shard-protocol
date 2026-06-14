// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title GhostShard
 * @author Ghost-Shard Protocol
 * @notice Ephemeral stealth account contract (shard) designed to securely store and transfer assets.
 * @dev Intended for use as an EIP-7702 delegation contract. All state-modifying asset flows are strictly
 * restricted to the designated SingletonRouter.
 */
contract GhostShard {
    using SafeERC20 for IERC20;

    /**
     * @notice The authorized central routing engine address permitted to trigger asset settlements.
     * @dev Configured as immutable to ensure high-efficiency execution while retaining configuration
     * flexibility during EIP-7702 environment orchestration.
     */
    address public immutable GHOST_ROUTER;

    /**
     * @notice Reverts if an account other than the authorized GHOST_ROUTER attempts to execute asset transfers.
     */
    error Unauthorized();

    /**
     * @notice Reverts if any downstream external asset transfer or call fails execution.
     */
    error TransferFailed(address shard);

    /**
     * @notice Restricts function invocation to the designated GHOST_ROUTER.
     */
    modifier onlyRouter() {
        _onlyRouter();
        _;
    }

    /**
     * @notice Initializes the shard contract and permanently binds it to an authorized routing execution framework.
     * @param _router The address of the central SingletonRouter deployment.
     */
    constructor(address _router) {
        GHOST_ROUTER = _router;
    }

    /**
     * @notice Dispatches native Ether or base utility tokens held by this contract to a designated target.
     * @dev Executes a low-level call forwarding all remaining gas. Reverts atomically on transfer failure.
     * @param to Recipient contract or externally owned account address.
     * @param amount Quantitative unit volume of native assets to settle.
     */
    function transferNative(
        address payable to,
        uint256 amount
    ) external onlyRouter {
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed(address(this));
    }

    /**
     * @notice Dispatches standard fungible ERC20 tokens held by this contract to a designated target.
     * @dev Accommodates missing boolean return values from non-compliant tokens safely by validating data lengths.
     * @param token Address of the target ERC20 token deployment.
     * @param to Recipient contract or externally owned account address.
     * @param amount Quantitative unit volume of tokens to settle.
     */
    function transferERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyRouter {
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );

        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed(address(this));
        }
    }

    /**
     * @notice Dispatches standard non-fungible ERC721 tokens held by this contract to a designated target.
     * @dev Invokes `transferFrom` explicitly. Assumes this contract already has full custody of the asset.
     * @param token Address of the target ERC721 collection deployment.
     * @param to Recipient contract or externally owned account address.
     * @param tokenId Unique identifier denoting the precise asset unit to settle.
     */
    function transferERC721(
        address token,
        address to,
        uint256 tokenId
    ) external onlyRouter {
        (bool success, ) = token.call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                address(this),
                to,
                tokenId
            )
        );
        if (!success) revert TransferFailed(address(this));
    }

    /**
     * @notice Internal validation hook evaluating the sender address identity context.
     * @dev Optimizes gas overhead across multiple entrypoints by consolidating bytecode assertion routines.
     */
    function _onlyRouter() internal view {
        if (msg.sender != GHOST_ROUTER) revert Unauthorized();
    }

    /**
     * @notice Explicit receive hook to accommodate direct native asset deposits.
     */
    receive() external payable {}
}

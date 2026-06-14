# Load environment variables from .env file
include .env
export

# Default target
all: deploy-router

# Deploy and verify the SingletonRouter contract
deploy-router:
	forge script script/DeployGhostRouter.s.sol:DeployGhostRouter \
		--rpc-url $(RPC_URL) \
		--broadcast \
		--verify \
		--etherscan-api-key $(ETHERSCAN_API_KEY)

# Deploy and verify the GhostShard contract (Requires ROUTER_ADDRESS in .env)
deploy-shard:
	forge script script/DeployGhostShard.s.sol:DeployGhostShard \
		--rpc-url $(RPC_URL) \
		--broadcast \
		--verify \
		--etherscan-api-key $(ETHERSCAN_API_KEY)

# Build/Compile the contracts
build:
	forge build

# Run project tests
test:
	forge test

const genesis = require("./genesis.config.js")
const ContractDeployer = require("../utils/contractDeployer")
const {contractId} = require("../utils/helpers")

const Controller = artifacts.require("Controller")
const ManagerProxy = artifacts.require("ManagerProxy")
const LivepeerToken = artifacts.require("LivepeerToken")
const GenesisManager = artifacts.require("GenesisManager")
const TokenDistributionMock = artifacts.require("TokenDistributionMock")

module.exports = function(deployer, network) {
    deployer.then(async () => {
        const lpDeployer = new ContractDeployer(deployer, Controller, ManagerProxy)

        const controller = await Controller.deployed()

        const tokenAddr = await controller.getContract(contractId("LivepeerToken"))
        const faucetAddr = await controller.getContract(contractId("LivepeerTokenFaucet"))
        const minterAddr = await controller.getContract(contractId("Minter"))

        const token = await LivepeerToken.at(tokenAddr)

        const tokenDistribution = await lpDeployer.deploy(TokenDistributionMock, tokenAddr, faucetAddr, genesis.tokenDistribution.endTime)
        const genesisManager = await lpDeployer.deploy(GenesisManager, tokenAddr, tokenDistribution.address, genesis.bankMultisig, minterAddr)

        deployer.logger.log("Transferring ownership of the LivepeerToken to the GenesisManager...")

        await token.transferOwnership(genesisManager.address)

        deployer.logger.log("Setting genesis token allocations...")

        await genesisManager.setAllocations(
            genesis.initialSupply,
            genesis.crowdSupply,
            genesis.companySupply,
            genesis.teamSupply,
            genesis.investorsSupply,
            genesis.communitySupply
        )

        deployer.logger.log("Starting genesis and allocating crowd supply for token distribution...")

        await genesisManager.start()

        deployer.logger.log("Adding team token grants...")

        await Promise.all(genesis.teamGrants.map(grant => {
            return genesisManager.addTeamGrant(grant.receiver, grant.amount, grant.timeToCliff, grant.vestingDuration)
        }))

        deployer.logger.log("Adding investor token grants...")

        await Promise.all(genesis.investorGrants.map(grant => {
            return genesisManager.addInvestorGrant(grant.receiver, grant.amount, grant.timeToCliff, grant.vestingDuration)
        }))

        deployer.logger.log("Adding community token grants...")

        await Promise.all(genesis.communityGrants.map(grant => {
            return genesisManager.addCommunityGrant(grant.receiver, grant.amount)
        }))

        deployer.logger.log("Finalizing token distribution...")

        await tokenDistribution.finalize()

        deployer.logger.log("Ending genesis and transferring ownership of the LivepeerToken to the protocol Minter...")

        await genesisManager.end()

        deployer.logger.log("Unpausing the Controller and starting the protocol...")

        await controller.unpause()
    })
}

const { ethers, network } = require("hardhat")
const fs = require("fs")

const frontEndContractsFile = "../nextjs-nft-marketplace/constants/networkMapping.json"

module.exports = async function () {
    if (process.env.UPDATE_FRONT_END) {
        console.log("Updating front end...")
        await updateContractAddresses()
    }
}

async function updateContractAddresses() {
    const nftMarketPlace = await ethers.getContract("NftMarketplace")
    const chainId = network.config.chainId
    const contractAddresses = JSON.parse(fs.readFileSync(frontEndContractsFile, "utf8"))
    if (chainId in contractAddresses) {
        if (!contractAddresses[chainId]["NftMarketplace"].includes(nftMarketPlace.address)) {
            contractAddresses[chainId]["NftMarketplace"].push(nftMarketPlace.address)
        }
    } else {
        contractAddresses[chainId] = { NftMarketplace: [nftMarketPlace.address] }
    }
    fs.writeFileSync(frontEndContractsFile, JSON.stringify(contractAddresses))
}

module.exports.tags = ["all", "frontend"]

const { expect, assert } = require("chai")
const { network, ethers, deployments } = require("hardhat")

!network.chainId == 31337
    ? describe.skip
    : describe("NFT Marketplace tests", function () {
          let nftMarketPlace, nftMarketPlaceBuyer, basicNft, buyer, seller, price, tokenId

          beforeEach(async () => {
              const accounts = await ethers.getSigners()
              price = ethers.utils.parseEther("0.1")
              tokenId = 0
              seller = accounts[0] // Deployer
              buyer = accounts[1]
              await deployments.fixture(["all"])

              // Seller instances of the Marketplace and BasicNFT
              basicNft = await ethers.getContract("BasicNft", seller)
              nftMarketPlace = await ethers.getContract("NftMarketplace", seller)

              // Minting 1 NFT by seller
              const mintNftTx = await basicNft.mintNft()
              await mintNftTx.wait(1)

              // Buyer instance of the Marketplace
              nftMarketPlaceBuyer = nftMarketPlace.connect(buyer)

              // Approving the NFT marketplace for transfers
              const approveTx = await basicNft.approve(nftMarketPlace.address, tokenId)
              await approveTx.wait(1)
          })

          describe("List item", () => {
              it("Reverts if NFT is already listed", async () => {
                  const tx = await nftMarketPlace.listItem(basicNft.address, tokenId, price)
                  await tx.wait(1)
                  const newTx = nftMarketPlace.listItem(basicNft.address, tokenId, price)
                  await expect(newTx).to.be.revertedWith("NftMarketplace__AlreadyListed")
              })

              it("Reverts if not owner", async () => {
                  const tx = nftMarketPlaceBuyer.listItem(basicNft.address, tokenId, price)
                  await expect(tx).to.be.revertedWith("NftMarketplace__NotOwner")
              })

              it("Reverts if the price is zero", async () => {
                  price = 0
                  const tx = nftMarketPlaceBuyer.listItem(basicNft.address, tokenId, price)
                  expect(tx).to.be.revertedWith("NftMarketplace__PriceMustBeAboveZero")
              })

              it("Reverts if the marketplace wasn't approved for transfer", async () => {
                  // Removing transfer approval permissions
                  const disapproveTx = await basicNft.approve(
                      ethers.constants.AddressZero,
                      tokenId
                  )
                  disapproveTx.wait(1)

                  const tx = nftMarketPlace.listItem(basicNft.address, tokenId, price)
                  await expect(tx).to.be.revertedWith("NftMarketplace__NotApprovedForMarketplace")
              })

              it("Updated the contract listing data and emits an event", async () => {
                  const tx = await nftMarketPlace.listItem(basicNft.address, tokenId, price)
                  expect(tx).to.emit("ItemListed")
                  const listing = await nftMarketPlace.getListing(basicNft.address, tokenId)
                  assert.equal(listing.price.toString(), price)
                  assert.equal(listing.seller, seller.address)
              })
          })
      })

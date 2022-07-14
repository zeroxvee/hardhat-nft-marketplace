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

          describe("Buy item", function () {
              it("Reverts if the NFT is not listed", async () => {
                  const tx = nftMarketPlaceBuyer.buyItem(basicNft.address, tokenId)
                  await expect(tx).to.be.revertedWith("NftMarketplace__NotListed")
              })

              it("Reverts if the amount of ETH sent is lower than the listed for NFT", async () => {
                  const listTx = await nftMarketPlace.listItem(basicNft.address, tokenId, price)
                  await listTx.wait(1)

                  price = 0
                  const tx = nftMarketPlaceBuyer.buyItem(basicNft.address, tokenId, {
                      value: price,
                  })
                  await expect(tx).to.be.revertedWith("NftMarketplace__PriceNotMet")
              })

              it("Updates the contract data, makes an nft transfer, emits an event", async () => {
                  const listTx = await nftMarketPlace.listItem(basicNft.address, tokenId, price)
                  await listTx.wait(1)

                  const buyTx = nftMarketPlaceBuyer.buyItem(basicNft.address, tokenId, {
                      value: price,
                  })
                  await expect(buyTx).to.emit(nftMarketPlace, "ItemSold")

                  const sellerEarnings = await nftMarketPlace.getEarnings(seller.address)
                  expect(sellerEarnings).to.be.above(0)

                  const listing = await nftMarketPlace.getListing(basicNft.address, tokenId)
                  expect(listing.price).to.equal(0)
              })
          })

          describe("Update listing", () => {
              it("Updates listing with the new price, emits an event", async () => {
                  const listTx = await nftMarketPlace.listItem(basicNft.address, tokenId, price)
                  await listTx.wait(1)

                  price = ethers.utils.parseEther("1")
                  const updateTx = await nftMarketPlace.updateItemListing(
                      basicNft.address,
                      tokenId,
                      price
                  )
                  await expect(updateTx).to.emit(nftMarketPlace, "ItemListed")

                  const listing = await nftMarketPlace.getListing(basicNft.address, tokenId)
                  assert.equal(listing.price.toString(), price.toString())
              })
          })

          describe("Cancel listing", function () {
              it("Cancels the listing, emits an event", async () => {
                  const listTx = await nftMarketPlace.listItem(basicNft.address, tokenId, price)
                  await listTx.wait(1)

                  const cancelTx = await nftMarketPlace.cancelItemListing(
                      basicNft.address,
                      tokenId
                  )
                  await expect(cancelTx).to.emit(nftMarketPlace, "ItemCanceled")
                  const listing = await nftMarketPlace.getListing(basicNft.address, tokenId)
                  assert.equal(listing.price, 0)
              })
          })
      })

const { expect, assert } = require("chai")
const { network, ethers, deployments } = require("hardhat")

!network.chainId == 31337
    ? describe.skip
    : describe("NFT Marketplace tests", function () {
          let nftMarketPlace, nftMarketPlaceBuyer, basicNft, buyer, seller, price
          const TOKEN_ID = 0

          beforeEach(async () => {
              const accounts = await ethers.getSigners()
              price = ethers.utils.parseEther("0.1")
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
              const approveTx = await basicNft.approve(nftMarketPlace.address, TOKEN_ID)
              await approveTx.wait(1)
          })

          describe("List item", () => {
              it("Reverts if NFT is already listed", async () => {
                  const tx = await nftMarketPlace.listItem(basicNft.address, TOKEN_ID, price)
                  await tx.wait(1)
                  const newTx = nftMarketPlace.listItem(basicNft.address, TOKEN_ID, price)
                  await expect(newTx).to.be.revertedWith("NftMarketplace__AlreadyListed")
              })

              it("Reverts if not owner", async () => {
                  const tx = nftMarketPlaceBuyer.listItem(basicNft.address, TOKEN_ID, price)
                  await expect(tx).to.be.revertedWith("NftMarketplace__NotOwner")
              })

              it("Reverts if the price is zero", async () => {
                  price = 0
                  const tx = nftMarketPlaceBuyer.listItem(basicNft.address, TOKEN_ID, price)
                  expect(tx).to.be.revertedWith("NftMarketplace__PriceMustBeAboveZero")
              })

              it("Reverts if the marketplace wasn't approved for transfer", async () => {
                  // Removing transfer approval permissions
                  const disapproveTx = await basicNft.approve(
                      ethers.constants.AddressZero,
                      TOKEN_ID
                  )
                  disapproveTx.wait(1)

                  const tx = nftMarketPlace.listItem(basicNft.address, TOKEN_ID, price)
                  await expect(tx).to.be.revertedWith("NftMarketplace__NotApprovedForMarketplace")
              })

              it("Updated the contract listing data and emits an event", async () => {
                  const tx = await nftMarketPlace.listItem(basicNft.address, TOKEN_ID, price)
                  expect(tx).to.emit("ItemListed")
                  const listing = await nftMarketPlace.getListing(basicNft.address, TOKEN_ID)
                  assert.equal(listing.price.toString(), price)
                  assert.equal(listing.seller, seller.address)
              })
          })

          describe("Buy item", function () {
              it("Reverts if the NFT is not listed", async () => {
                  const tx = nftMarketPlaceBuyer.buyItem(basicNft.address, TOKEN_ID)
                  await expect(tx).to.be.revertedWith("NftMarketplace__NotListed")
              })

              it("Reverts if the amount of ETH sent is lower than the listed for NFT", async () => {
                  const listTx = await nftMarketPlace.listItem(basicNft.address, TOKEN_ID, price)
                  await listTx.wait(1)

                  price = 0
                  const tx = nftMarketPlaceBuyer.buyItem(basicNft.address, TOKEN_ID, {
                      value: price,
                  })
                  await expect(tx).to.be.revertedWith("NftMarketplace__PriceNotMet")
              })

              it("Updates the contract data, makes an nft transfer, emits an event", async () => {
                  const listTx = await nftMarketPlace.listItem(basicNft.address, TOKEN_ID, price)
                  await listTx.wait(1)

                  const buyTx = nftMarketPlaceBuyer.buyItem(basicNft.address, TOKEN_ID, {
                      value: price,
                  })
                  await expect(buyTx).to.emit(nftMarketPlace, "ItemSold")

                  const sellerEarnings = await nftMarketPlace.getEarnings(seller.address)
                  expect(sellerEarnings).to.be.above(0)

                  const listing = await nftMarketPlace.getListing(basicNft.address, TOKEN_ID)
                  expect(listing.price).to.equal(0)
              })
          })

          describe("Update listing", () => {
              it("Updates listing with the new price, emits an event", async () => {
                  const listTx = await nftMarketPlace.listItem(basicNft.address, TOKEN_ID, price)
                  await listTx.wait(1)

                  price = ethers.utils.parseEther("1")
                  const updateTx = await nftMarketPlace.updateItemListing(
                      basicNft.address,
                      TOKEN_ID,
                      price
                  )
                  await expect(updateTx).to.emit(nftMarketPlace, "ItemListed")

                  const listing = await nftMarketPlace.getListing(basicNft.address, TOKEN_ID)
                  assert.equal(listing.price.toString(), price.toString())
              })
          })

          describe("Cancel listing", function () {
              it("Cancels the listing, emits an event", async () => {
                  const listTx = await nftMarketPlace.listItem(basicNft.address, TOKEN_ID, price)
                  await listTx.wait(1)

                  const cancelTx = await nftMarketPlace.cancelItemListing(
                      basicNft.address,
                      TOKEN_ID
                  )
                  await expect(cancelTx).to.emit(nftMarketPlace, "ItemCanceled")
                  const listing = await nftMarketPlace.getListing(basicNft.address, TOKEN_ID)
                  assert.equal(listing.price, 0)
              })
          })

          describe("Withdraw earnings", () => {
              it("Reverts if no earnings to withdraw avaliable", async () => {
                  const withdrawTx = nftMarketPlace.withdrawEarnings()
                  await expect(withdrawTx).to.be.revertedWith(
                      "NftMarketplace__NoEarningsToWithdraw"
                  )
              })

              it("Sends ETH to the seller of the NFT, updates contract data", async () => {
                  const listTx = await nftMarketPlace.listItem(basicNft.address, TOKEN_ID, price)
                  await listTx.wait(1)

                  // Seller balance after listing but before withdrawing
                  const initialSellerBalance = await seller.getBalance()
                  const buyTx = await nftMarketPlaceBuyer.buyItem(basicNft.address, TOKEN_ID, {
                      value: price,
                  })
                  await buyTx.wait(1)

                  // withdrawing ETH
                  const withdrawTx = await nftMarketPlace.withdrawEarnings()
                  const withdrawTxReceipt = await withdrawTx.wait(1)
                  const {
                      gasUsed: gasUsedWithdraw,
                      effectiveGasPrice: effectiveGasPriceWithdraw,
                  } = withdrawTxReceipt
                  const withdrawGasCost = gasUsedWithdraw.mul(effectiveGasPriceWithdraw)

                  // Seller balance after withdrawal
                  const sellerBalance = await seller.getBalance()

                  expect(await nftMarketPlace.getEarnings(seller.address)).to.equal(0)
                  expect(sellerBalance.add(withdrawGasCost)).to.equal(
                      initialSellerBalance.add(price)
                  )
              })
          })
      })

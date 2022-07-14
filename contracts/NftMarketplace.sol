// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// Customr Errors
error NftMarketplace__PriceMustBeAboveZero();
error NftMarketplace__NotApprovedForMarketplace();
error NftMarketplace__NotOwner();
error NftMarketplace__TransferFailed();
error NftMarketplace__NoEarningsToWithdraw();
error NftMarketplace__AlreadyListed(address nftAdress, uint256 tokenId);
error NftMarketplace__NotListed(address nftAdress, uint256 tokenId);
error NftMarketplace__PriceNotMet(address nftAddress, uint256 tokenId, uint256 nftPrice);

contract NftMarketplace is ReentrancyGuard {
    struct Listing {
        uint256 price;
        address seller;
    }

    // NFT Contract address => NFT Token ID => Listing
    mapping(address => mapping(uint256 => Listing)) private s_listings;

    // Seller address => Amount earned
    mapping(address => uint256) private s_earnings;

    // Events
    event ItemListed(
        address indexed seller,
        address indexed nftAddress,
        uint256 indexed tokenId,
        uint256 price
    );

    event ItemSold(
        address indexed seller,
        address indexed buyer,
        address indexed nftAddress,
        uint256 tokenId,
        uint256 price
    );

    event ItemCanceled(
        address indexed seller,
        address indexed nftAddress,
        uint256 indexed tokenId
    );

    // Modifiers
    modifier notListed(address nftAddress, uint256 tokenId) {
        Listing memory listing = s_listings[nftAddress][tokenId];
        if (listing.price > 0) {
            revert NftMarketplace__AlreadyListed(nftAddress, tokenId);
        }
        _;
    }

    modifier isListed(address nftAdress, uint256 tokenId) {
        Listing memory listing = s_listings[nftAdress][tokenId];
        if (listing.price == 0) {
            revert NftMarketplace__NotListed(nftAdress, tokenId);
        }
        _;
    }

    modifier isOwner(
        address nftAddress,
        uint256 tokenId,
        address spender
    ) {
        IERC721 nft = IERC721(nftAddress);
        address owner = nft.ownerOf(tokenId);
        if (spender != owner) {
            revert NftMarketplace__NotOwner();
        }
        _;
    }

    // Contract Functions
    /**
     * @notice Method for listing an NFT on the marketplace
     * @param nftAddress contract address of the NFT
     * @param tokenId token id of the NFT
     * @param price sale price for the listed NFT
     * @dev The marketplace place gets approved for the nft transfer and lists the NFT,
     * the transfer is processed when someone buys it.
     */
    function listItem(
        address nftAddress,
        uint256 tokenId,
        uint256 price
    ) external notListed(nftAddress, tokenId) isOwner(nftAddress, tokenId, msg.sender) {
        if (price <= 0) {
            revert NftMarketplace__PriceMustBeAboveZero();
        }

        IERC721 nft = IERC721(nftAddress);
        if (nft.getApproved(tokenId) != address(this)) {
            revert NftMarketplace__NotApprovedForMarketplace();
        }
        s_listings[nftAddress][tokenId] = Listing(price, msg.sender);
        emit ItemListed(msg.sender, nftAddress, tokenId, price);
    }

    function buyItem(address nftAddress, uint256 tokenId)
        external
        payable
        nonReentrant
        isListed(nftAddress, tokenId)
    {
        Listing memory listedItem = s_listings[nftAddress][tokenId];
        uint256 price = listedItem.price;
        if (msg.value < price) {
            revert NftMarketplace__PriceNotMet(nftAddress, tokenId, price);
        }

        address seller = listedItem.seller;
        s_earnings[seller] += msg.value;
        delete s_listings[nftAddress][tokenId];
        IERC721(nftAddress).safeTransferFrom(seller, msg.sender, tokenId);
        emit ItemSold(seller, msg.sender, nftAddress, tokenId, price);
    }

    function cancelItemListing(address nftAddress, uint256 tokenId)
        external
        isListed(nftAddress, tokenId)
        isOwner(nftAddress, tokenId, msg.sender)
    {
        delete s_listings[nftAddress][tokenId];
        emit ItemCanceled(msg.sender, nftAddress, tokenId);
    }

    function updateItemListing(
        address nftAddress,
        uint256 tokenId,
        uint256 newPrice
    ) external isListed(nftAddress, tokenId) isOwner(nftAddress, tokenId, msg.sender) {
        s_listings[nftAddress][tokenId].price = newPrice;
        emit ItemListed(msg.sender, nftAddress, tokenId, newPrice);
    }

    function withdrawEarnings() external {
        uint256 earnings = s_earnings[msg.sender];
        if (earnings <= 0) {
            revert NftMarketplace__NoEarningsToWithdraw();
        }
        s_earnings[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: earnings}("");
        if (!success) {
            revert NftMarketplace__TransferFailed();
        }
    }
}

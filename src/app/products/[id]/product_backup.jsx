"use client";

import React, { useState, useEffect } from "react";
import ProductGallery from "@/components/ProductGallery";
import SliderProduct from "@/components/Product/SliderProduct";
import SliderCollection from "@/components/Colleaction/SliderCollection";
import VideoReels from "@/components/VideoReels";
import SupportBenefits from "@/components/SupportBenefits";
import ProductGrid from "@/components/Product/ProductGrid";

import { ShoppingBag, Heart, Star, Truck, Shield, RotateCcw, ChevronRight, Share2, Plus, Minus, Check, Gift, Tag, Percent } from "lucide-react";
import { Button } from "@heroui/react";
import { useCart } from "@/hooks/useCart";
import { useCurrency } from "@/hooks/useCurrency";

export default function Product({ data }) {
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);
  const [wishlist, setWishlist] = useState([]);
  const [showMobileFooter, setShowMobileFooter] = useState(false);
  const [timeLeft, setTimeLeft] = useState(8 * 60); // 8 minutes in seconds
  const [pincode, setPincode] = useState("");
  const [deliveryInfo, setDeliveryInfo] = useState(null);
  const [checkingDelivery, setCheckingDelivery] = useState(false);
  const { addToCart, isAddingToCart } = useCart();
  const { symbol: currencySymbol } = useCurrency();

  useEffect(() => {
    // Load wishlist from localStorage
    const savedWishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
    setWishlist(savedWishlist);

    // Countdown timer effect
    const timer = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          return 8 * 60; // Reset to 8 minutes when it reaches 0
        }
        return prevTime - 1;
      });
    }, 1000);

    // Handle scroll to show/hide mobile footer
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      const windowHeight = window.innerHeight;

      // Show footer when user scrolls down more than 200px
      setShowMobileFooter(scrollPosition > 200);
    };

    window.addEventListener("scroll", handleScroll);
    
    return () => {
      clearInterval(timer);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const handleQuantityChange = (type) => {
    if (type === "increment") {
      setQuantity(quantity + 1);
    } else if (type === "decrement" && quantity > 1) {
      setQuantity(quantity - 1);
    }
  };

  const handleAddToCart = async () => {
    await addToCart(data, quantity);
  };

  const handleBuyNow = () => {
    const buyNowData = [
      {
        productId: data._id,
        title: data.title,
        quantity: quantity,
        color: selectedColor || null,
        size: selectedSize || null,
        image: data.images?.[0] || "",
        price: parseFloat(data.salePrice || data.regularPrice),
        currency: data.currencySymbol || currencySymbol,
      },
    ];

    localStorage.setItem("buyNow", JSON.stringify(buyNowData));
    window.location.href = "/checkout";
  };

  const handleWishlist = () => {
    const wishlistItem = {
      productId: data._id,
      title: data.title,
      image: data.images[0]?.url,
      price: data.salePrice || data.regularPrice,
      regularPrice: data.regularPrice,
      salePrice: data.salePrice,
      currency: data.currencySymbol || "₹",
      rating: data.rating,
      productLabel: data.productLabel,
      addedAt: new Date().toISOString(),
    };

    let updatedWishlist;
    const isInWishlist = wishlist.some((item) => item.productId === data._id);

    if (isInWishlist) {
      updatedWishlist = wishlist.filter((item) => item.productId !== data._id);
    } else {
      updatedWishlist = [...wishlist, wishlistItem];
    }

    setWishlist(updatedWishlist);
    localStorage.setItem("wishlist", JSON.stringify(updatedWishlist));

    // Dispatch event to update header
    window.dispatchEvent(new Event("wishlistUpdated"));
  };

  const isInWishlist = () => {
    return wishlist.some((item) => item.productId === data._id);
  };

  const handleShare = async () => {
    const shareData = {
      title: data.title,
      text: `Check out this amazing product: ${data.title}`,
      url: window.location.href,
    };

    try {
      // Check if Web Share API is supported
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback: Copy URL to clipboard
        await navigator.clipboard.writeText(window.location.href);
        
        // Show a temporary notification
        const notification = document.createElement('div');
        notification.textContent = 'Link copied to clipboard!';
        notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-opacity';
        document.body.appendChild(notification);
        
        setTimeout(() => {
          notification.style.opacity = '0';
          setTimeout(() => {
            document.body.removeChild(notification);
          }, 300);
        }, 2000);
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handlePincodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
    if (value.length <= 6) {
      setPincode(value);
      if (value.length === 6) {
        checkDelivery(value);
      } else {
        setDeliveryInfo(null);
      }
    }
  };

  const checkDelivery = async (pincodeValue) => {
    setCheckingDelivery(true);
    
    // Simulate API call with a delay
    setTimeout(() => {
      setDeliveryInfo({
        available: true,
        days: 2,
        location: getLocationFromPincode(pincodeValue),
        freeDelivery: true,
        codAvailable: true
      });
      setCheckingDelivery(false);
    }, 1000);
  };

  const getLocationFromPincode = (pincode) => {
    // Mock location data based on pincode patterns
    const locations = {
      '11': 'Delhi',
      '12': 'Haryana', 
      '40': 'Mumbai',
      '56': 'Karnataka',
      '60': 'Tamil Nadu',
      '50': 'Telangana',
      '30': 'Rajasthan',
      '20': 'Punjab'
    };
    
    const prefix = pincode.substring(0, 2);
    return locations[prefix] || 'India';
  };

  const calculateDiscount = () => {
    if (data.salePrice && data.regularPrice) {
      return Math.round(((+data.regularPrice - +data.salePrice) / +data.regularPrice) * 100);
    }
    return 0;
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const discount = calculateDiscount();

  return (
    <div className="bg-white min-h-screen">
      {/* Main Product Section */}
      <div className="container mx-auto px-3 py-4 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Product Gallery */}
          <div className="order-1">
            <ProductGallery images={data.images} title={data.title} />
          </div>

          {/* Right: Product Details */}
          <div className="order-2 space-y-4">
            {/* Title */}
            <div>
              <h1 className="text-sm font-medium text-gray-900 leading-relaxed mb-2">{data.title}</h1>
              
              {/* Rating */}
              {data.rating && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center bg-green-600 text-white px-2 py-1 rounded text-xs font-medium gap-1">
                    <span>{data.rating}</span>
                    <Star className="w-3 h-3 fill-white" />
                  </div>
                  <span className="text-xs text-gray-500">1,234 reviews</span>
                </div>
              )}
            </div>

            {/* Countdown Timer */}
            <div className="bg-red-500 text-white rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                  <span className="text-xs font-medium">LIMITED OFFER</span>
                </div>
                <div className="bg-black/20 rounded px-2 py-1">
                  <span className="text-sm font-bold font-mono">{formatTime(timeLeft)}</span>
                </div>
              </div>
              <p className="text-xs opacity-90">Hurry! Offer ends soon</p>
            </div>

            {/* Price */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                {data.salePrice && discount > 0 && (
                  <span className="bg-red-500 text-white px-2 py-1 rounded text-xs font-medium">
                    {discount}% OFF
                  </span>
                )}
                <span className="bg-green-500 text-white px-2 py-1 rounded text-xs font-medium">Best Price</span>
              </div>

              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-xl font-bold text-gray-900">
                  {data.currencySymbol || currencySymbol}
                  {data.salePrice || data.regularPrice}
                </span>
                {data.salePrice && (
                  <span className="text-sm text-gray-500 line-through">
                    {data.currencySymbol || currencySymbol}
                    {data.regularPrice}
                  </span>
                )}
              </div>

              {data.salePrice && discount > 0 && (
                <div className="bg-green-100 rounded-lg p-2 mb-2">
                  <div className="flex items-center gap-2 text-green-800">
                    <Gift className="w-3 h-3" />
                    <span className="text-xs font-medium">
                      You Save: {data.currencySymbol || currencySymbol}
                      {(+data.regularPrice - +data.salePrice).toFixed(0)}
                    </span>
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500">Inclusive of all taxes • Free shipping</p>
            </div>

              {/* Stock Status */}
              <div className="bg-green-50 border border-green-200 rounded px-4 py-2 inline-block">
                <p className="text-sm font-medium text-green-700">In Stock</p>
              </div>

              {/* Delivery Check */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Truck className="w-5 h-5 text-blue-600" />
                  <h3 className="text-base font-semibold text-blue-900">Check Delivery</h3>
                </div>
                
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={pincode}
                      onChange={handlePincodeChange}
                      placeholder="Enter 6-digit pincode"
                      maxLength={6}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <Button
                      size="sm"
                      isLoading={checkingDelivery}
                      isDisabled={pincode.length !== 6}
                      onPress={() => checkDelivery(pincode)}
                      className="bg-blue-600 text-white font-medium hover:bg-blue-700 px-4 py-2 text-sm rounded-lg"
                    >
                      {checkingDelivery ? "Checking..." : "Check"}
                    </Button>
                  </div>

                  {deliveryInfo && (
                    <div className="bg-white rounded-lg p-4 border border-blue-100">
                      <div className="flex items-start gap-3">
                        <div className="bg-green-100 rounded-full p-2">
                          <Check className="w-4 h-4 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900 mb-1">
                            Delivery Available to {deliveryInfo.location}
                          </p>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Truck className="w-4 h-4 text-green-600" />
                              <span className="text-sm text-gray-700">
                                <strong>{deliveryInfo.days} Day Guaranteed Delivery</strong>
                              </span>
                            </div>
                            {deliveryInfo.freeDelivery && (
                              <div className="flex items-center gap-2">
                                <Gift className="w-4 h-4 text-green-600" />
                                <span className="text-sm text-gray-700">Free Delivery</span>
                              </div>
                            )}
                            {deliveryInfo.codAvailable && (
                              <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-green-600" />
                                <span className="text-sm text-gray-700">Cash on Delivery Available</span>
                              </div>
                            )}
                          </div>
                          <div className="bg-green-50 rounded-lg p-2 mt-2">
                            <p className="text-xs text-green-700 font-medium">
                              ✓ Order today and get it by {new Date(Date.now() + deliveryInfo.days * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-600">
                    Enter your pincode to check delivery options and estimated delivery time
                  </p>
                </div>
              </div>


              {/* Size Selector */}
              {data.sizes && data.sizes.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900">Size:</h3>
                  <div className="flex flex-wrap gap-2">
                    {data.sizes.map((size) => (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={`px-4 py-2 border rounded text-sm font-medium transition-all ${
                          selectedSize === size ? "border-orange-500 bg-orange-50 text-orange-600" : "border-gray-300 hover:border-gray-400 text-gray-700"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Color Selector */}
              {data.colors && data.colors.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900">Color:</h3>
                  <div className="flex flex-wrap gap-2">
                    {data.colors.map((color) => (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${selectedColor === color ? "border-orange-500 scale-110" : "border-gray-300"}`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity Selector */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900">Quantity:</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleQuantityChange("decrement")}
                    disabled={quantity <= 1}
                    className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-base font-medium min-w-[40px] text-center">{quantity}</span>
                  <button onClick={() => handleQuantityChange("increment")} className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-100">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Action Buttons - Single Row */}
              <div className="flex gap-3 pt-2">
                <Button
                  size="lg"
                  isLoading={isAddingToCart(data._id)}
                  onPress={handleAddToCart}
                  className="flex-1 bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-500 h-12 text-sm rounded-full shadow-sm"
                >
                  {isAddingToCart(data._id) ? "Adding..." : "Add to Cart"}
                </Button>
                <Button size="lg" onPress={handleBuyNow} className="flex-1 bg-orange-500 text-white font-medium hover:bg-orange-600 h-12 text-sm rounded-full shadow-sm">
                  Buy Now
                </Button>
              </div>

              {/* Wishlist & Share */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleWishlist}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 border rounded-lg text-sm font-medium transition-colors ${
                    isInWishlist() ? "border-red-500 text-red-600 bg-red-50" : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isInWishlist() ? "fill-current" : ""}`} />
                  <span>Wishlist</span>
                </button>
                <button 
                  onClick={handleShare}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share</span>
                </button>
              </div>

              {/* Trust Badges */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 text-xs text-gray-700">
                  <Shield className="w-5 h-5 text-gray-500" />
                  <span>Secure transaction</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-700">
                  <RotateCcw className="w-5 h-5 text-gray-500" />
                  <span>7 days replacement</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-700">
                  <Truck className="w-5 h-5 text-gray-500" />
                  <span>Free shipping</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-700">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>Quality assured</span>
                </div>
              </div>

              {/* Description */}
              {data.shortDescription && (
                <div className="space-y-2 pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">About this item</h3>
                  <p className="text-sm text-gray-700 leading-relaxed">{data.shortDescription}</p>
                </div>
              )}

              {/* Full Description */}
              {data.description && (
                <div className="pt-4 border-t border-gray-200">
                  <details className="group">
                    <summary className="flex items-center justify-between cursor-pointer text-sm font-semibold text-gray-900 py-2">
                      Product Details
                      <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="text-sm text-gray-700 leading-relaxed mt-2 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: data.description }} />
                  </details>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Related Products Section */}
      <div className="py-8 bg-white ">
        <ProductGrid />
      </div>

      {/* Video Reels */}
      <div className="py-8 bg-white ">
        <VideoReels />
      </div>

      {/* Support Benefits */}
      <div className="bg-white ">
        <SupportBenefits />
      </div>

      {/* Mobile Fixed Footer - Buy Now Button */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg transition-transform duration-300 md:hidden ${
          showMobileFooter ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Countdown Timer for Mobile */}
        <div className="bg-red-500 text-white px-4 py-2 text-center">
          <div className="flex items-center justify-center gap-2 text-sm">
            <span className="font-semibold">LIMITED OFFER:</span>
            <span className="bg-black/20 rounded px-2 py-0.5 font-mono font-bold">{formatTime(timeLeft)}</span>
          </div>
        </div>
        
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Price Info */}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-gray-900">
                  {data.currencySymbol}
                  {data.salePrice || data.regularPrice}
                </span>
                {data.salePrice && (
                  <span className="text-sm text-gray-500 line-through">
                    {data.currencySymbol}
                    {data.regularPrice}
                  </span>
                )}
              </div>
              {discount > 0 && <span className="text-xs text-green-600 font-medium">Save {discount}%</span>}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button size="sm" isLoading={isAddingToCart(data._id)} onPress={handleAddToCart} className="bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-500 px-4 py-2 text-sm rounded-lg">
                {isAddingToCart(data._id) ? "Adding..." : "Add to Cart"}
              </Button>
              <Button size="sm" onPress={handleBuyNow} className="bg-orange-500 text-white font-medium hover:bg-orange-600 px-6 py-2 text-sm rounded-lg">
                Buy Now
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Add bottom padding to prevent content overlap with fixed footer */}
      <div className="h-20 md:hidden"></div>
    </div>
  );
}

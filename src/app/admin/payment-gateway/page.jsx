"use client";

import { useState, useEffect } from "react";
import { Badge, Spinner, Switch, Input } from "@heroui/react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter
} from "@heroui/modal";
import { CheckCircle, XCircle, Settings, Globe, Edit } from "lucide-react";
import CustomButton from "@/components/block/CustomButton";

export default function PaymentMethodsPage() {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [currentEditGateway, setCurrentEditGateway] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  const [gateways, setGateways] = useState({
    stripe: { enabled: false, publishableKey: "", secretKey: "", webhookSecret: "" },
    paypal: { enabled: false, clientId: "", clientSecret: "", mode: "sandbox" },
    razorpay: { enabled: false, keyId: "", keySecret: "", webhookSecret: "" },
    cashfree: { enabled: false, appId: "", secretKey: "", mode: "sandbox" },
    payu: { enabled: false, merchantId: "", merchantKey: "", merchantSalt: "", mode: "test" },
    phonepe: { enabled: false, merchantId: "", saltKey: "", saltIndex: "", mode: "sandbox" },
    paytm: { enabled: false, merchantId: "", merchantKey: "", industryType: "", website: "", mode: "staging" }
  });

  const gatewayConfig = {
    stripe: {
      name: "Stripe",
      description: "Global payment processing with cards",
      status: "active",
      logo: "https://logos-world.net/wp-content/uploads/2021/03/Stripe-Logo.png",
      note: "Supports credit/debit cards globally",
    },
    paypal: {
      name: "PayPal",
      description: "Digital wallet and payments",
      status: "active", 
      logo: "https://logos-world.net/wp-content/uploads/2020/07/PayPal-Logo.png",
      note: "Popular digital wallet worldwide",
    },
    razorpay: {
      name: "Razorpay",
      description: "Complete payment solution for India",
      status: "active",
      logo: "https://razorpay.com/assets/razorpay-logo.svg",
      note: "Cards, UPI, NetBanking, Wallets",
    },
    cashfree: {
      name: "Cashfree",
      description: "Payment gateway for Indian businesses",
      status: "active",
      logo: "https://cashfreelogo.cashfree.com/website/landings/homepage/cashfree10Logo.svg",
      note: "Cards, UPI, NetBanking, EMI",
    },
    payu: {
      name: "PayU",
      description: "Leading payment processor in India",
      status: "active",
      logo: "https://devguide.payu.in/website-assets/uploads/2021/12/new-payu-logo.svg",
      note: "Cards, UPI, NetBanking, EMI, Wallets",
    },
    phonepe: {
      name: "PhonePe",
      description: "UPI and digital payments",
      status: "active",
      logo: "https://images.ctfassets.net/drk57q8lctrm/2xVzOuwCEAwvno1fx5Ywo/13fbf64e95946dc6164e626392336cfe/phonepe-logo.webp",
      note: "UPI, Cards, Wallets",
    },
    paytm: {
      name: "Paytm",
      description: "All-in-one payment gateway",
      status: "active", 
      logo: "https://d1.awsstatic.com/Paytm-Logo.516dcbea24a48dc1f0187700fbd0f6a48f9a18c3.png",
      note: "UPI, Cards, Wallets, NetBanking",
    },
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/setting?type=payment");
      const data = await res.json();
      if (data && Object.keys(data).length > 0) {
        setGateways({
          stripe: data.stripe || gateways.stripe,
          paypal: data.paypal || gateways.paypal,
          razorpay: data.razorpay || gateways.razorpay,
          cashfree: data.cashfree || gateways.cashfree,
          payu: data.payu || gateways.payu,
          phonepe: data.phonepe || gateways.phonepe,
          paytm: data.paytm || gateways.paytm,
        });
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setting?type=payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gateways),
      });
      if (res.ok) alert("Settings saved successfully!");
      else alert("Failed to save settings");
    } catch (err) {
      console.error(err);
      alert("Error saving settings");
    } finally {
      setLoading(false);
    }
  };

  const updateGateway = (key, field, value) => {
    setGateways({
      ...gateways,
      [key]: { ...gateways[key], [field]: value },
    });
  };

  // Function to check if gateway has all required credentials
  const hasRequiredCredentials = (key, gateway) => {
    switch (key) {
      case "stripe":
        return gateway.publishableKey && gateway.secretKey;
      case "paypal":
        return gateway.clientId && gateway.clientSecret;
      case "razorpay":
        return gateway.keyId && gateway.keySecret;
      case "cashfree":
        return gateway.appId && gateway.secretKey;
      case "payu":
        return gateway.merchantId && gateway.merchantKey && gateway.merchantSalt;
      case "phonepe":
        return gateway.merchantId && gateway.saltKey && gateway.saltIndex;
      case "paytm":
        return gateway.merchantId && gateway.merchantKey && gateway.industryType && gateway.website;
      default:
        return false;
    }
  };

  // Function to handle gateway enable/disable with validation
  const handleGatewayToggle = (key, value) => {
    if (value && !hasRequiredCredentials(key, gateways[key])) {
      alert(`Please configure all required credentials for ${gatewayConfig[key].name} before enabling it.`);
      return;
    }
    updateGateway(key, "enabled", value);
  };

  // Function to open edit modal
  const openEditModal = (gatewayKey) => {
    setCurrentEditGateway(gatewayKey);
    setEditFormData({ ...gateways[gatewayKey] });
    setEditModalOpen(true);
  };

  // Function to handle edit form changes
  const handleEditFormChange = (field, value) => {
    setEditFormData({
      ...editFormData,
      [field]: value,
    });
  };

  // Function to save credentials from modal
  const saveCredentials = () => {
    setGateways({
      ...gateways,
      [currentEditGateway]: { ...editFormData },
    });
    setEditModalOpen(false);
    setCurrentEditGateway(null);
    setEditFormData({});
  };

  // Function to close modal
  const closeModal = () => {
    setEditModalOpen(false);
    setCurrentEditGateway(null);
    setEditFormData({});
  };

  if (fetching) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Spinner color="secondary" variant="gradient" size="lg" />
      </div>
    );
  }

  return (
    <div className="md:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payment Methods</h1>
          <p className="text-gray-600 mt-1">Configure your payment gateways and manage transaction settings</p>
        </div>
        <CustomButton intent="primary" size="lg" isLoading={loading} onPress={handleSave} className="px-6">
          <Settings className="w-4 h-4 mr-2" /> Save Changes
        </CustomButton>
      </div>

      {/* Payment Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {Object.entries(gatewayConfig).map(([key, config]) => {
          const gateway = gateways[key];
          const isActive = gateway.enabled;
          const hasCredentials = hasRequiredCredentials(key, gateway);
          const canActivate = hasCredentials || !isActive;

          return (
            <div key={key} className="bg-white rounded-lg  p-6">
              <div className="flex flex-col gap-6">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <img src={config.logo} alt={config.name} className="h-8 w-auto" />
                  </div>
                  {config.status === "coming" && <span className="text-xs font-semibold bg-orange-100 text-orange-600 px-2 py-1 rounded-md">Coming Soon</span>}
                </div>

                <p className="text-sm text-gray-600">{config.description}</p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CustomButton
                      intent="ghost"
                      size="sm"
                      onPress={() => openEditModal(key)}
                      className="p-2"
                    >
                      <Edit className="w-4 h-4" />
                    </CustomButton>
                    <Switch 
                      isSelected={isActive} 
                      isDisabled={config.status === "coming"} 
                      onValueChange={(v) => handleGatewayToggle(key, v)} 
                      color="success" 
                      size="lg" 
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {isActive ? (
                      hasCredentials ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-orange-500" />
                      )
                    ) : (
                      <XCircle className="w-4 h-4 text-gray-400" />
                    )}
                    <span className={`text-xs font-medium ${
                      isActive ? 
                        (hasCredentials ? "text-green-600" : "text-orange-600") 
                        : "text-gray-500"
                    }`}>
                      {isActive ? 
                        (hasCredentials ? "Active" : "Missing Credentials") 
                        : "Inactive"
                      }
                    </span>
                  </div>
                </div>

                {config.note && config.status === "active" && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Globe className="w-3 h-3 text-orange-400" />
                    <span>{config.note}</span>
                  </div>
                )}

                {/* Credential Status Warning */}
                {isActive && !hasCredentials && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium text-orange-700">
                        Missing Required Credentials
                      </span>
                    </div>
                    <p className="text-xs text-orange-600 mt-1">
                      Please click the edit button to configure all required fields.
                    </p>
                  </div>
                )}

                {/* Configuration moved to modal — click edit to open credentials form */}
                <div className="mt-2">
                  <p className="text-sm text-gray-500">Click the edit (pencil) icon to configure credentials in a secure modal.</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Credentials Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={closeModal}
        size="2xl"
        scrollBehavior="inside"
        classNames={{
          backdrop: "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20"
        }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              {currentEditGateway && gatewayConfig[currentEditGateway] && (
                <>
                  <img 
                    src={gatewayConfig[currentEditGateway].logo} 
                    alt={gatewayConfig[currentEditGateway].name} 
                    className="h-8 w-auto" 
                  />
                  <div>
                    <h3 className="text-lg font-semibold">Configure {gatewayConfig[currentEditGateway].name}</h3>
                    <p className="text-sm text-gray-600">{gatewayConfig[currentEditGateway].description}</p>
                  </div>
                </>
              )}
            </div>
          </ModalHeader>
          <ModalBody>
            {currentEditGateway && (
              <div className="space-y-8">
                {currentEditGateway === "stripe" && (
                  <>
                    <Input
                      labelPlacement="outside"
                      label="Publishable Key"
                      placeholder="pk_test_..."
                      value={editFormData.publishableKey || ""}
                      onChange={(e) => handleEditFormChange("publishableKey", e.target.value)}
                      description="Your Stripe publishable key (starts with pk_)"
                    />
                    <Input
                      labelPlacement="outside"
                      label="Secret Key"
                      placeholder="sk_test_..."
                      type="password"
                      value={editFormData.secretKey || ""}
                      onChange={(e) => handleEditFormChange("secretKey", e.target.value)}
                      description="Your Stripe secret key (starts with sk_)"
                    />
                    <Input
                      labelPlacement="outside"
                      label="Webhook Secret (Optional)"
                      placeholder="whsec_..."
                      type="password"
                      value={editFormData.webhookSecret || ""}
                      onChange={(e) => handleEditFormChange("webhookSecret", e.target.value)}
                      description="Webhook endpoint secret for verification"
                    />
                  </>
                )}

                {currentEditGateway === "paypal" && (
                  <>
                    <Input
                      labelPlacement="outside"
                      label="Client ID"
                      placeholder="Your PayPal Client ID"
                      value={editFormData.clientId || ""}
                      onChange={(e) => handleEditFormChange("clientId", e.target.value)}
                      description="PayPal application client ID"
                    />
                    <Input
                      labelPlacement="outside"
                      label="Client Secret"
                      placeholder="Your PayPal Client Secret"
                      type="password"
                      value={editFormData.clientSecret || ""}
                      onChange={(e) => handleEditFormChange("clientSecret", e.target.value)}
                      description="PayPal application client secret"
                    />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Environment</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="paypal-modal-mode"
                            checked={editFormData.mode === "sandbox"}
                            onChange={() => handleEditFormChange("mode", "sandbox")}
                            className="text-blue-500"
                          />
                          <span className="text-sm">Sandbox</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="paypal-modal-mode"
                            checked={editFormData.mode === "live"}
                            onChange={() => handleEditFormChange("mode", "live")}
                            className="text-blue-500"
                          />
                          <span className="text-sm">Live</span>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {currentEditGateway === "razorpay" && (
                  <>
                    <Input
                      labelPlacement="outside"
                      label="Key ID"
                      placeholder="rzp_test_..."
                      value={editFormData.keyId || ""}
                      onChange={(e) => handleEditFormChange("keyId", e.target.value)}
                      description="Razorpay Key ID (starts with rzp_)"
                    />
                    <Input
                      labelPlacement="outside"
                      label="Key Secret"
                      placeholder="Your Razorpay Secret"
                      type="password"
                      value={editFormData.keySecret || ""}
                      onChange={(e) => handleEditFormChange("keySecret", e.target.value)}
                      description="Razorpay Key Secret"
                    />
                    <Input
                      labelPlacement="outside"
                      label="Webhook Secret (Optional)"
                      placeholder="Webhook Secret"
                      type="password"
                      value={editFormData.webhookSecret || ""}
                      onChange={(e) => handleEditFormChange("webhookSecret", e.target.value)}
                      description="Webhook secret for payment verification"
                    />
                  </>
                )}

                {currentEditGateway === "cashfree" && (
                  <>
                    <Input
                      labelPlacement="outside"
                      label="App ID"
                      placeholder="Your Cashfree App ID"
                      value={editFormData.appId || ""}
                      onChange={(e) => handleEditFormChange("appId", e.target.value)}
                      description="Cashfree Application ID"
                    />
                    <Input
                      labelPlacement="outside"
                      label="Secret Key"
                      placeholder="Your Cashfree Secret Key"
                      type="password"
                      value={editFormData.secretKey || ""}
                      onChange={(e) => handleEditFormChange("secretKey", e.target.value)}
                      description="Cashfree Secret Key"
                    />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Environment</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="cashfree-modal-mode"
                            checked={editFormData.mode === "sandbox"}
                            onChange={() => handleEditFormChange("mode", "sandbox")}
                            className="text-blue-500"
                          />
                          <span className="text-sm">Sandbox</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="cashfree-modal-mode"
                            checked={editFormData.mode === "production"}
                            onChange={() => handleEditFormChange("mode", "production")}
                            className="text-blue-500"
                          />
                          <span className="text-sm">Production</span>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {currentEditGateway === "payu" && (
                  <>
                    <Input
                      labelPlacement="outside"
                      label="Merchant ID"
                      placeholder="Your PayU Merchant ID"
                      value={editFormData.merchantId || ""}
                      onChange={(e) => handleEditFormChange("merchantId", e.target.value)}
                      description="PayU Merchant ID"
                    />
                    <Input
                      labelPlacement="outside"
                      label="Merchant Key"
                      placeholder="Your PayU Merchant Key"
                      type="password"
                      value={editFormData.merchantKey || ""}
                      onChange={(e) => handleEditFormChange("merchantKey", e.target.value)}
                      description="PayU Merchant Key"
                    />
                    <Input
                      labelPlacement="outside"
                      label="Merchant Salt"
                      placeholder="Your PayU Merchant Salt"
                      type="password"
                      value={editFormData.merchantSalt || ""}
                      onChange={(e) => handleEditFormChange("merchantSalt", e.target.value)}
                      description="PayU Merchant Salt for hash generation"
                    />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Environment</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="payu-modal-mode"
                            checked={editFormData.mode === "test"}
                            onChange={() => handleEditFormChange("mode", "test")}
                            className="text-blue-500"
                          />
                          <span className="text-sm">Test</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="payu-modal-mode"
                            checked={editFormData.mode === "live"}
                            onChange={() => handleEditFormChange("mode", "live")}
                            className="text-blue-500"
                          />
                          <span className="text-sm">Live</span>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {currentEditGateway === "phonepe" && (
                  <>
                    <Input
                      labelPlacement="outside"
                      label="Merchant ID"
                      placeholder="Your PhonePe Merchant ID"
                      value={editFormData.merchantId || ""}
                      onChange={(e) => handleEditFormChange("merchantId", e.target.value)}
                      description="PhonePe Merchant ID"
                    />
                    <Input
                      labelPlacement="outside"
                      label="Salt Key"
                      placeholder="Your PhonePe Salt Key"
                      type="password"
                      value={editFormData.saltKey || ""}
                      onChange={(e) => handleEditFormChange("saltKey", e.target.value)}
                      description="PhonePe Salt Key for API calls"
                    />
                    <Input
                      labelPlacement="outside"
                      label="Salt Index"
                      placeholder="Salt Index (usually 1)"
                      value={editFormData.saltIndex || ""}
                      onChange={(e) => handleEditFormChange("saltIndex", e.target.value)}
                      description="Salt Index (typically 1)"
                    />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Environment</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="phonepe-modal-mode"
                            checked={editFormData.mode === "sandbox"}
                            onChange={() => handleEditFormChange("mode", "sandbox")}
                            className="text-blue-500"
                          />
                          <span className="text-sm">Sandbox</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="phonepe-modal-mode"
                            checked={editFormData.mode === "production"}
                            onChange={() => handleEditFormChange("mode", "production")}
                            className="text-blue-500"
                          />
                          <span className="text-sm">Production</span>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {currentEditGateway === "paytm" && (
                  <>
                    <Input
                      labelPlacement="outside"
                      label="Merchant ID"
                      placeholder="Your Paytm Merchant ID"
                      value={editFormData.merchantId || ""}
                      onChange={(e) => handleEditFormChange("merchantId", e.target.value)}
                      description="Paytm Merchant ID"
                    />
                    <Input
                      labelPlacement="outside"
                      label="Merchant Key"
                      placeholder="Your Paytm Merchant Key"
                      type="password"
                      value={editFormData.merchantKey || ""}
                      onChange={(e) => handleEditFormChange("merchantKey", e.target.value)}
                      description="Paytm Merchant Key"
                    />
                    <Input
                      labelPlacement="outside"
                      label="Industry Type"
                      placeholder="Retail (or your industry type)"
                      value={editFormData.industryType || ""}
                      onChange={(e) => handleEditFormChange("industryType", e.target.value)}
                      description="Industry type (e.g., Retail, Services)"
                    />
                    <Input
                      labelPlacement="outside"
                      label="Website"
                      placeholder="WEBSTAGING (or your website name)"
                      value={editFormData.website || ""}
                      onChange={(e) => handleEditFormChange("website", e.target.value)}
                      description="Website parameter (e.g., WEBSTAGING for test)"
                    />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Environment</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="paytm-modal-mode"
                            checked={editFormData.mode === "staging"}
                            onChange={() => handleEditFormChange("mode", "staging")}
                            className="text-blue-500"
                          />
                          <span className="text-sm">Staging</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="paytm-modal-mode"
                            checked={editFormData.mode === "production"}
                            onChange={() => handleEditFormChange("mode", "production")}
                            className="text-blue-500"
                          />
                          <span className="text-sm">Production</span>
                        </label>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <CustomButton intent="ghost" onPress={closeModal} className="mr-2">
              Cancel
            </CustomButton>
            <CustomButton 
              intent="primary" 
              onPress={saveCredentials}
              disabled={!currentEditGateway || !hasRequiredCredentials(currentEditGateway, editFormData)}
            >
              Save Credentials
            </CustomButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

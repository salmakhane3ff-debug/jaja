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

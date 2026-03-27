"use client";

import { useEffect, useState } from "react";
import { Input, Switch, Button, Card, CardBody, CardHeader } from "@heroui/react";
import { Clock, Settings, RotateCcw, Save, Package, Truck, Home, CheckCircle } from "lucide-react";
import CustomButton from "@/components/block/CustomButton";

export default function OrderSettingsPage() {
  const [settings, setSettings] = useState({
    dispatchAfterHours: 12,
    inTransitAfterHours: 24,
    outForDeliveryAfterHours: 36,
    deliveredAfterHours: 48,
    autoUpdateStatus: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/order-settings");
      if (res.ok) {
        const data = await res.json();
        setSettings({
          dispatchAfterHours: data.dispatchAfterHours || 12,
          inTransitAfterHours: data.inTransitAfterHours || 24,
          outForDeliveryAfterHours: data.outForDeliveryAfterHours || 36,
          deliveredAfterHours: data.deliveredAfterHours || 48,
          autoUpdateStatus: data.autoUpdateStatus !== false,
        });
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/order-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        alert("Order timing settings updated successfully!");
      } else {
        const errorData = await res.json();
        alert(errorData.error || "Failed to update settings");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Are you sure you want to reset to default settings?")) {
      return;
    }

    setResetting(true);
    try {
      const res = await fetch("/api/order-settings", {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        setSettings({
          dispatchAfterHours: data.dispatchAfterHours,
          inTransitAfterHours: data.inTransitAfterHours,
          outForDeliveryAfterHours: data.outForDeliveryAfterHours,
          deliveredAfterHours: data.deliveredAfterHours,
          autoUpdateStatus: data.autoUpdateStatus,
        });
        alert("Settings reset to default values!");
      } else {
        alert("Failed to reset settings");
      }
    } catch (error) {
      console.error("Error resetting settings:", error);
      alert("Failed to reset settings");
    } finally {
      setResetting(false);
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Calculate days and hours for display
  const formatTime = (hours) => {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (days > 0 && remainingHours > 0) {
      return `${days} day${days > 1 ? 's' : ''} ${remainingHours} hour${remainingHours > 1 ? 's' : ''}`;
    } else if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''}`;
    } else {
      return `${remainingHours} hour${remainingHours > 1 ? 's' : ''}`;
    }
  };

  const statusSteps = [
    {
      title: "Order Placed",
      description: "Order is received and confirmed",
      icon: CheckCircle,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      time: "Immediate",
      key: null,
    },
    {
      title: "Dispatched",
      description: "Order is packed and dispatched from warehouse",
      icon: Package,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      time: formatTime(settings.dispatchAfterHours),
      key: "dispatchAfterHours",
    },
    {
      title: "In Transit",
      description: "Order is on the way to destination",
      icon: Truck,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      time: formatTime(settings.inTransitAfterHours),
      key: "inTransitAfterHours",
    },
    {
      title: "Out for Delivery",
      description: "Order is out for final delivery",
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
      time: formatTime(settings.outForDeliveryAfterHours),
      key: "outForDeliveryAfterHours",
    },
    {
      title: "Delivered",
      description: "Order has been successfully delivered",
      icon: Home,
      color: "text-green-600",
      bgColor: "bg-green-50",
      time: formatTime(settings.deliveredAfterHours),
      key: "deliveredAfterHours",
    },
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-80px)]">
        <div className="text-center">
          <Clock className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order Status Settings</h1>
          <p className="text-gray-600 text-sm mt-1">
            Configure when order status changes automatically based on time elapsed
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CustomButton
            intent="secondary"
            size="sm"
            onPress={handleReset}
            isLoading={resetting}
            className="flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </CustomButton>
          <CustomButton
            intent="primary"
            size="sm"
            onPress={handleSave}
            isLoading={saving}
            className="flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Settings
          </CustomButton>
        </div>
      </div>

      {/* Auto Update Toggle */}
      <Card>
        <CardBody className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Auto Status Updates</h3>
              <p className="text-gray-600 text-sm mt-1">
                Automatically update order status based on time elapsed since order placement
              </p>
            </div>
            <Switch
              isSelected={settings.autoUpdateStatus}
              onValueChange={(checked) => updateSetting('autoUpdateStatus', checked)}
              color="primary"
            />
          </div>
        </CardBody>
      </Card>

      {/* Status Timeline Configuration */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Status Timeline Configuration</h3>
          </div>
          <p className="text-gray-600 text-sm">
            Set the number of hours after order placement when each status should be automatically triggered
          </p>
        </CardHeader>
        <CardBody className="pt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Settings Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dispatch After (hours)
                </label>
                <Input
                  type="number"
                  min="1"
                  value={settings.dispatchAfterHours.toString()}
                  onChange={(e) => updateSetting('dispatchAfterHours', parseInt(e.target.value) || 1)}
                  placeholder="24"
                  description="When order moves to 'Dispatched' status"
                />
                <p className="text-xs text-gray-500 mt-1">
                  = {formatTime(settings.dispatchAfterHours)} after order placement
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  In Transit After (hours)
                </label>
                <Input
                  type="number"
                  min={settings.dispatchAfterHours + 1}
                  value={settings.inTransitAfterHours.toString()}
                  onChange={(e) => updateSetting('inTransitAfterHours', parseInt(e.target.value) || settings.dispatchAfterHours + 1)}
                  placeholder="48"
                  description="When order moves to 'In Transit' status"
                />
                <p className="text-xs text-gray-500 mt-1">
                  = {formatTime(settings.inTransitAfterHours)} after order placement
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Out for Delivery After (hours)
                </label>
                <Input
                  type="number"
                  min={settings.inTransitAfterHours + 1}
                  value={settings.outForDeliveryAfterHours.toString()}
                  onChange={(e) => updateSetting('outForDeliveryAfterHours', parseInt(e.target.value) || settings.inTransitAfterHours + 1)}
                  placeholder="96"
                  description="When order moves to 'Out for Delivery' status"
                />
                <p className="text-xs text-gray-500 mt-1">
                  = {formatTime(settings.outForDeliveryAfterHours)} after order placement
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Delivered After (hours)
                </label>
                <Input
                  type="number"
                  min={settings.outForDeliveryAfterHours + 1}
                  value={settings.deliveredAfterHours.toString()}
                  onChange={(e) => updateSetting('deliveredAfterHours', parseInt(e.target.value) || settings.outForDeliveryAfterHours + 1)}
                  placeholder="120"
                  description="When order moves to 'Delivered' status"
                />
                <p className="text-xs text-gray-500 mt-1">
                  = {formatTime(settings.deliveredAfterHours)} after order placement
                </p>
              </div>
            </div>

            {/* Visual Timeline */}
            <div className="bg-gray-50 rounded-xl p-6">
              <h4 className="font-medium text-gray-900 mb-4">Status Timeline Preview</h4>
              <div className="space-y-4">
                {statusSteps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div key={index} className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${step.bgColor} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-5 h-5 ${step.color}`} />
                      </div>
                      <div className="flex-1">
                        <h5 className="font-medium text-gray-900 text-sm">{step.title}</h5>
                        <p className="text-xs text-gray-600">{step.description}</p>
                        <p className="text-xs font-medium text-blue-600 mt-1">
                          After: {step.time}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Info Card */}
      <Card>
        <CardBody className="p-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">How It Works</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Status updates are calculated based on the time elapsed since order placement</li>
                <li>• Each status change happens automatically when the specified time is reached</li>
                <li>• You can customize the timing for each status stage according to your delivery process</li>
                <li>• Changes apply to all future orders and existing orders in the tracking system</li>
                <li>• Customers will see the updated status when they track their orders</li>
              </ul>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
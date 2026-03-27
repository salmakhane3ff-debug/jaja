"use client";

import { useState, useEffect } from "react";
import { Input, Button, Card, CardBody, CardHeader } from "@heroui/react";
import { User, Lock, Shield, Mail, Eye, EyeOff } from "lucide-react";

export default function AdminProfilePage() {
  const [profile, setProfile] = useState({
    name: "",
    email: "",
  });
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/admin/profile");
      if (res.ok) {
        const data = await res.json();
        setProfile({
          name: data.name || "",
          email: data.email || "",
        });
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const updateData = {
        name: profile.name,
        email: profile.email,
      };

      // Add password update if provided
      if (passwords.newPassword) {
        if (passwords.newPassword !== passwords.confirmPassword) {
          setError("New passwords do not match");
          setLoading(false);
          return;
        }
        if (passwords.newPassword.length < 6) {
          setError("New password must be at least 6 characters long");
          setLoading(false);
          return;
        }
        updateData.currentPassword = passwords.currentPassword;
        updateData.newPassword = passwords.newPassword;
      }

      const res = await fetch("/api/admin/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage("Profile updated successfully!");
        setPasswords({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        // Refresh profile data
        await fetchProfile();
      } else {
        setError(data.error || "Failed to update profile");
      }
    } catch (error) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  if (loadingProfile) {
    return (
      <div className="container mx-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-blue-100 rounded-xl">
            <User className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Profile</h1>
            <p className="text-gray-600">Manage your account settings and security</p>
          </div>
        </div>

        <form onSubmit={handleProfileUpdate} className="space-y-6">
          {/* Profile Information */}
          <Card>
            <CardHeader className="flex items-center gap-3 pb-4">
              <User className="w-5 h-5 text-gray-600" />
              <div>
                <h3 className="text-lg font-semibold">Profile Information</h3>
                <p className="text-sm text-gray-600">Update your personal details</p>
              </div>
            </CardHeader>
            <CardBody className="pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Full Name"
                  labelPlacement="outside"
                  placeholder="Enter your full name"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  startContent={<User className="w-4 h-4 text-gray-400" />}
                />
                <Input
                  label="Email Address"
                  labelPlacement="outside"
                  type="email"
                  placeholder="Enter your email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  startContent={<Mail className="w-4 h-4 text-gray-400" />}
                />
              </div>
            </CardBody>
          </Card>

          {/* Password Update */}
          <Card>
            <CardHeader className="flex items-center gap-3 pb-4">
              <Lock className="w-5 h-5 text-gray-600" />
              <div>
                <h3 className="text-lg font-semibold">Change Password</h3>
                <p className="text-sm text-gray-600">Leave blank if you don't want to change password</p>
              </div>
            </CardHeader>
            <CardBody className="pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Current Password"
                  labelPlacement="outside"
                  type={showPasswords.current ? "text" : "password"}
                  placeholder="Enter current password"
                  value={passwords.currentPassword}
                  onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                  startContent={<Lock className="w-4 h-4 text-gray-400" />}
                  endContent={
                    <button type="button" onClick={() => togglePasswordVisibility("current")} className="text-gray-400 hover:text-gray-600">
                      {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
                <Input
                  label="New Password"
                  labelPlacement="outside"
                  type={showPasswords.new ? "text" : "password"}
                  placeholder="Enter new password"
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                  startContent={<Lock className="w-4 h-4 text-gray-400" />}
                  endContent={
                    <button type="button" onClick={() => togglePasswordVisibility("new")} className="text-gray-400 hover:text-gray-600">
                      {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
                <Input
                  label="Confirm New Password"
                  labelPlacement="outside"
                  type={showPasswords.confirm ? "text" : "password"}
                  placeholder="Confirm new password"
                  value={passwords.confirmPassword}
                  onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                  startContent={<Lock className="w-4 h-4 text-gray-400" />}
                  endContent={
                    <button type="button" onClick={() => togglePasswordVisibility("confirm")} className="text-gray-400 hover:text-gray-600">
                      {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
              </div>
            </CardBody>
          </Card>

          {/* Messages */}
          {message && <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">{message}</div>}

          {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>}

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button type="submit" color="primary" size="lg" disabled={loading} className="px-8">
              {loading ? "Updating..." : "Update Profile"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

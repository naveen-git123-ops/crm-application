import React, { useState } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { User, Mail, Shield, Calendar, Upload } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const Settings = () => {
  const { user } = useAuth();
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [mobileNumber, setMobileNumber] = useState(user?.phone || '');
  const [photoPreview, setPhotoPreview] = useState(user?.profile_photo || null);
  const [loading, setLoading] = useState(false);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfilePhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadPhoto = async () => {
    if (!profilePhoto) {
      toast.error('Please select a photo');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', profilePhoto);

      const response = await axios.post(`${API}/employees/profile/photo-upload`, formData, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      setProfilePhoto(null);
      toast.success('Profile photo updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload photo');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMobileNumber = async () => {
    if (!mobileNumber.trim()) {
      toast.error('Please enter a mobile number');
      return;
    }

    setLoading(true);
    try {
      await axios.put(`${API}/employees/profile/update`, 
        { phone: mobileNumber },
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      toast.success('Mobile number updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update mobile number');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="settings-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
        <p className="text-gray-600 text-sm mt-1">Manage your account settings and preferences</p>
      </div>

      {/* User Profile */}
      <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">User Profile</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <User className="h-10 w-10 text-blue-600" />
            <div className="flex-1">
              <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">Full Name</p>
              <p className="font-medium text-gray-900">{user?.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <Mail className="h-10 w-10 text-blue-600" />
            <div className="flex-1">
              <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">Email Address</p>
              <p className="font-medium text-gray-900">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <Shield className="h-10 w-10 text-blue-600" />
            <div className="flex-1">
              <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">Role</p>
              <p className="font-medium text-gray-900">{user?.role}</p>
            </div>
          </div>

          {user?.employee_id && (
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <Calendar className="h-10 w-10 text-blue-600" />
              <div className="flex-1">
                <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">Employee ID</p>
                <p className="font-mono font-medium text-gray-900">{user.employee_id}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Editable Profile Information */}
      <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Update Profile Information</h3>
        
        <div className="space-y-6">
          {/* Mobile Number Section */}
          <div className="space-y-3">
            <Label htmlFor="mobile" className="text-sm font-medium text-gray-700">
              Mobile Number
            </Label>
            <div className="flex gap-2">
              <Input
                id="mobile"
                type="tel"
                placeholder="Enter your mobile number"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <Button
                onClick={handleUpdateMobileNumber}
                disabled={loading}
                className="bg-blue-600 text-white hover:bg-blue-700 h-10"
              >
                {loading ? 'Saving...' : 'Save'}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Your mobile number will appear on your ID card
            </p>
          </div>

          {/* Profile Photo Section */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-gray-700">
              Profile Photo
            </Label>
            
            <div className="flex gap-4">
              {/* Photo Preview */}
              <div className="flex-shrink-0">
                <div className="w-24 h-24 bg-blue-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 overflow-hidden">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : user?.profile_photo ? (
                    <img src={BACKEND_URL + user.profile_photo} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User className="h-12 w-12 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Upload Section */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    id="photo"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="border border-gray-300 rounded-lg text-gray-900"
                  />
                </div>
                
                {profilePhoto && (
                  <Button
                    onClick={handleUploadPhoto}
                    disabled={loading}
                    className="bg-blue-600 text-white hover:bg-blue-700 w-full gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    {loading ? 'Uploading...' : 'Upload Photo'}
                  </Button>
                )}
                
                <p className="text-xs text-gray-500">
                  Supported formats: JPG, PNG, GIF (Max 5MB). Your photo will appear on your ID card.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* System Info */}
      <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">System Information</h3>
        <div className="space-y-3 text-sm bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex justify-between">
            <span className="text-gray-600 font-medium">Application Version</span>
            <span className="font-mono font-medium text-gray-900">1.0.0</span>
          </div>
          <div className="flex justify-between border-t border-gray-300 pt-3">
            <span className="text-gray-600 font-medium">Theme</span>
            <span className="font-medium text-gray-900">RESOLINE TECHBIS Professional</span>
          </div>
          <div className="flex justify-between border-t border-gray-300 pt-3">
            <span className="text-gray-600 font-medium">Last Login</span>
            <span className="font-mono text-xs text-gray-600">{new Date().toLocaleString()}</span>
          </div>
        </div>
      </Card>
    </div>
  );
};
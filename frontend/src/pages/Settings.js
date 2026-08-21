import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { User, Mail, Shield, Calendar, Upload, MapPin, Send, ExternalLink, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import { API_ENDPOINT, BACKEND_BASE_URL } from '@/lib/apiConfig';

const BACKEND_URL = BACKEND_BASE_URL;
const API = API_ENDPOINT;

export const Settings = () => {
  const { user } = useAuth();
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [mobileNumber, setMobileNumber] = useState(user?.phone || '');
  const [photoPreview, setPhotoPreview] = useState(user?.profile_photo || null);
  const [loading, setLoading] = useState(false);
  const [officeLocation, setOfficeLocation] = useState({ configured: false, latitude: null, longitude: null });
  const [officeLoading, setOfficeLoading] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState({ enabled: false, linked: false });
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramConnectUrl, setTelegramConnectUrl] = useState(null);
  const [manualChatId, setManualChatId] = useState('');
  const [savingChatId, setSavingChatId] = useState(false);
  const [showManualChatId, setShowManualChatId] = useState(false);

  const refreshTelegramStatus = () => {
    axios
      .get(`${API}/telegram/status`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then((res) => {
        setTelegramStatus(res.data);
        if (res.data.linked) {
          setTelegramConnectUrl(null);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshTelegramStatus();

    if (user?.role === 'Admin') {
      axios.get(`${API}/settings/office-location`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
        .then((res) => setOfficeLocation({ configured: res.data.configured, latitude: res.data.latitude, longitude: res.data.longitude }))
        .catch(() => {});
    }
  }, [user?.role]);

  const handleTestTelegram = async () => {
    setTelegramLoading(true);
    try {
      await axios.post(
        `${API}/telegram/test-notification`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
      );
      toast.success('Test notification sent — check Telegram');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send test notification');
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleConnectTelegram = async () => {
    setTelegramLoading(true);
    try {
      const { data } = await axios.get(`${API}/telegram/connect-link`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setTelegramConnectUrl(data.url);
      setTimeout(refreshTelegramStatus, 8000);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not generate Telegram connect link');
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleSaveChatId = async () => {
    if (!manualChatId.trim()) {
      toast.error('Enter your Telegram Chat ID first');
      return;
    }
    setSavingChatId(true);
    try {
      const { data } = await axios.put(
        `${API}/telegram/chat-id`,
        { chat_id: manualChatId.trim() },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
      );
      setTelegramStatus(data);
      setManualChatId('');
      setTelegramConnectUrl(null);
      toast.success('Telegram Chat ID saved');
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(Array.isArray(detail) ? detail[0]?.msg : (detail || 'Failed to save Chat ID'));
    } finally {
      setSavingChatId(false);
    }
  };

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

  const setOfficeFromCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Location is not supported by your browser');
      return;
    }
    setOfficeLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        axios.put(
          `${API}/settings/office-location`,
          { latitude: lat, longitude: lng },
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
        )
          .then(() => {
            setOfficeLocation({ configured: true, latitude: lat, longitude: lng });
            toast.success('Office location set. Punch in/out within 50 m of this spot will count as office attendance.');
          })
          .catch((err) => toast.error(err.response?.data?.detail || 'Failed to set office location'))
          .finally(() => setOfficeLoading(false));
      },
      () => {
        toast.error('Could not get your location. Please enable location access.');
        setOfficeLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-5" data-testid="settings-page">
      <div>
        <h1 className="text-[1.35rem] sm:text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account settings and preferences</p>
      </div>

      <Card className="p-5 sm:p-6">
        <h3 className="text-sm font-semibold tracking-tight text-foreground mb-4">User Profile</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl border border-border">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <User className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-[0.08em]">Full Name</p>
              <p className="font-medium text-foreground">{user?.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl border border-border">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <Mail className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-[0.08em]">Email Address</p>
              <p className="font-medium text-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl border border-border">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <Shield className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-[0.08em]">Role</p>
              <p className="font-medium text-foreground">{user?.role}</p>
            </div>
          </div>

          {user?.employee_id && (
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl border border-border">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
                <Calendar className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-[0.08em]">Employee ID</p>
                <p className="font-mono font-medium text-foreground">{user.employee_id}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {telegramStatus.enabled ? (
        <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#229ED9]/10">
              <Send className="h-5 w-5 text-[#1c8ac2]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">Connect Telegram</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Link your own Telegram to @{telegramStatus.bot_username || 'Resoline_bot'} to get login, leave, task, and approval alerts. You can do this yourself — no admin is needed.
              </p>
            </div>
          </div>

          {telegramStatus.linked ? (
            <div className="space-y-4">
              <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Your Telegram is connected{telegramStatus.chat_id ? ` (Chat ID ${telegramStatus.chat_id})` : ''}.
                  You can punch in/out in the bot with <code className="text-xs bg-white px-1 rounded">/punchin</code> or <code className="text-xs bg-white px-1 rounded">/punchout</code>.
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={telegramLoading}
                >
                  {telegramLoading ? 'Sending…' : 'Send test notification'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleConnectTelegram}
                  disabled={telegramLoading}
                >
                  {telegramLoading ? 'Generating link…' : 'Reconnect Telegram'}
                </Button>
                <Button type="button" variant="outline" onClick={refreshTelegramStatus}>
                  Refresh status
                </Button>
              </div>
              {telegramConnectUrl ? (
                <a
                  href={telegramConnectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setTimeout(refreshTelegramStatus, 8000)}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#229ED9] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1c8ac2] transition-colors"
                >
                  <Send className="h-4 w-4" />
                  Open @{telegramStatus.bot_username || 'Resoline_bot'} and tap Start
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                Your Telegram is not connected yet. Use the button below — it opens the bot with your account already identified.
              </p>

              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-5">
                <li>Tap <strong className="text-foreground">Connect Telegram</strong></li>
                <li>Telegram opens @{telegramStatus.bot_username || 'Resoline_bot'}</li>
                <li>Tap <strong className="text-foreground">Start</strong> in Telegram</li>
                <li>Come back here and tap <strong className="text-foreground">Refresh status</strong></li>
              </ol>

              <div className="flex flex-wrap items-center gap-2">
                {telegramConnectUrl ? (
                  <a
                    href={telegramConnectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setTimeout(refreshTelegramStatus, 8000)}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#229ED9] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1c8ac2] transition-colors min-h-[44px]"
                  >
                    <Send className="h-4 w-4" />
                    Open @{telegramStatus.bot_username || 'Resoline_bot'} and tap Start
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <Button
                    type="button"
                    onClick={handleConnectTelegram}
                    disabled={telegramLoading}
                    className="bg-[#229ED9] text-white hover:bg-[#1c8ac2] min-h-[44px]"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {telegramLoading ? 'Generating link…' : 'Connect Telegram'}
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={refreshTelegramStatus}>
                  Refresh status
                </Button>
              </div>

              <button
                type="button"
                className="text-xs font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                onClick={() => setShowManualChatId((v) => !v)}
              >
                {showManualChatId ? 'Hide manual Chat ID' : 'I already have a Chat ID'}
              </button>

              {showManualChatId ? (
                <div className="space-y-2">
                  <Label htmlFor="manual_chat_id" className="text-sm font-medium">
                    Telegram Chat ID
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="manual_chat_id"
                      value={manualChatId}
                      onChange={(e) => setManualChatId(e.target.value)}
                      placeholder="e.g. 123456789"
                      className="h-11"
                    />
                    <Button
                      type="button"
                      onClick={handleSaveChatId}
                      disabled={savingChatId}
                      className="shrink-0"
                    >
                      {savingChatId ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Numeric Chat ID only (not your @username). Prefer Connect Telegram above if you are unsure.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-5 sm:p-6 border-amber-200 bg-amber-50">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Connect Telegram</h3>
          <p className="text-sm text-amber-900 mt-2">
            {user?.role === 'Admin'
              ? <>Telegram is not configured on the server yet. Set <code className="text-xs bg-white px-1 rounded">TELEGRAM_BOT_TOKEN</code> in the backend environment and restart the API.</>
              : 'Telegram notifications are not enabled on this workspace yet. You can still use Settings for your profile. Ask an admin to enable the Telegram bot when it is ready.'}
          </p>
        </Card>
      )}

      {/* Editable Profile Information */}
      <Card className="p-5 sm:p-6">
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
                    <img 
                      src={user.profile_photo.startsWith('http') ? user.profile_photo : BACKEND_URL + user.profile_photo} 
                      alt="Profile" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling?.style?.removeProperty('display');
                      }}
                    />
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

      {/* Office location - Admin only */}
      {user?.role === 'Admin' && (
        <Card className="p-5 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            Office Location
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Set the office location for attendance. Employees can punch in/out only within 50 m of this point. Outside 50 m is recorded as Tour (requires your or Manager approval).
          </p>
          {officeLocation.configured ? (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-700 mb-4">
              <span className="font-medium">Current office:</span>{' '}
              {officeLocation.latitude?.toFixed(6)}, {officeLocation.longitude?.toFixed(6)}
            </div>
          ) : (
            <p className="text-sm text-amber-700 mb-4">Office location not set. Set it so that attendance uses location-based rules.</p>
          )}
          <Button
            onClick={setOfficeFromCurrentLocation}
            disabled={officeLoading}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            <MapPin className="h-4 w-4 mr-2" />
            {officeLoading ? 'Getting location...' : 'Use my current location as office'}
          </Button>
        </Card>
      )}

      {/* System Info */}
      <Card className="p-5 sm:p-6">
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
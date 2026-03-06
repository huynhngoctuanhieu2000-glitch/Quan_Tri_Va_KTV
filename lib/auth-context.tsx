'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User, Role, MOCK_USERS, MOCK_ROLES, ModuleId } from './mock-db';
import { createClient } from './supabase';
import { authenticateUser } from '@/app/login/actions';

interface AuthContextType {
  user: User | null;
  role: Role | null;
  login: (userId: string, password?: string) => Promise<boolean>;
  logout: () => void;
  changePassword: (newPassword: string) => void;
  updateProfile: (name: string, avatarUrl: string) => void;
  hasPermission: (moduleId: ModuleId) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    // Initialization already handled in useState
  }, []);

  const login = async (userId: string, password?: string) => {
    try {
      // Use the Server Action to query public."Users" table
      const response = await authenticateUser(userId, password);

      if (response.success && response.user) {
        const dbUser = response.user;

        // Map database Role ENUM to local Role ID
        let roleId = 'ktv';
        if (dbUser.role === 'ADMIN') roleId = 'admin';
        else if (dbUser.role === 'MANAGER') roleId = 'branch_manager';
        else if (dbUser.role === 'RECEPTIONIST' || dbUser.role === 'LEAD_RECEPTIONIST') roleId = 'reception';

        setUser({
          id: dbUser.id,
          password: dbUser.password,
          name: dbUser.fullName || dbUser.username,
          roleId: roleId,
          avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(dbUser.fullName || dbUser.username)}`
        });

        const fallbackRole = MOCK_ROLES.find(r => r.id === roleId) || null;

        setRole({
          id: roleId,
          name: dbUser.role,
          // Use DB permissions if available, else fallback to mock permissions
          permissions: (dbUser.permissions && Array.isArray(dbUser.permissions))
            ? dbUser.permissions
            : fallbackRole?.permissions || []
        });

        return true;
      }

      // Fallback to MOCK_USERS if not found in Database (just for backwards compatibility / testing)
      const u = MOCK_USERS.find(user => user.id === userId || user.id === userId.replace('admin_', 'u'));
      if (u && (!password || u.password === password)) {
        setUser(u);
        setRole(MOCK_ROLES.find(r => r.id === u.roleId) || null);
        return true;
      }

      return false;
    } catch (err) {
      console.error('Login error:', err);
      return false;
    }
  };

  const logout = async () => {
    setUser(null);
    setRole(null);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (e) { }
  };

  const changePassword = (newPassword: string) => {
    if (user) {
      const u = MOCK_USERS.find(u => u.id === user.id);
      if (u) {
        u.password = newPassword;
        setUser({ ...user, password: newPassword });
      }
    }
  };

  const updateProfile = (name: string, avatarUrl: string) => {
    if (user) {
      const u = MOCK_USERS.find(u => u.id === user.id);
      if (u) {
        u.name = name;
        u.avatarUrl = avatarUrl;
        setUser({ ...user, name, avatarUrl });
      }
    }
  };

  const hasPermission = useCallback((moduleId: ModuleId) => {
    if (!role) return false;
    return role.permissions.includes(moduleId);
  }, [role]);

  return (
    <AuthContext.Provider value={{ user, role, login, logout, changePassword, updateProfile, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

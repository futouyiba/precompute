import React, { useState, useEffect } from 'react';

interface User {
    name: string;
    avatar: string;
}

const UserInfo: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        // Fetch user info from backend
        fetch('/api/user')
            .then(res => {
                if (res.ok) return res.json();
                throw new Error('Not logged in');
            })
            .then(data => {
                if (data.loggedIn) {
                    setUser(data.user);
                }
            })
            .catch(() => {
                // Not logged in or dev mode without backend
                setUser(null);
            });
    }, []);

    if (!user) {
        return (
            <a href="/auth/login" className="login-btn">
                Log in
            </a>
        );
    }

    return (
        <div className="user-info">
            <img src={user.avatar} alt={user.name} className="user-avatar" />
            <span className="user-name">{user.name}</span>
            <a href="/auth/logout" className="logout-btn" title="Logout">×</a>
        </div>
    );
};

export default UserInfo;

// Firebase Messaging Service Worker
// This file MUST be at the root of your site (GitHub Pages root)
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAIjhvbCztHoF7YwP2IYIk2C6jCI64uFhs",
  authDomain: "jjj2195-1bd15.firebaseapp.com",
  projectId: "jjj2195-1bd15",
  storageBucket: "jjj2195-1bd15.firebasestorage.app",
  messagingSenderId: "370852437825",
  appId: "1:370852437825:web:b0a891d6a99b426d230bc0"
});

const messaging = firebase.messaging();

// Handle background messages (when page is not focused)
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Background message:', payload);
  const title = payload.notification?.title || payload.data?.title || '새 알림';
  const options = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: payload.data?.url || '/index.html' }
  };
  return self.registration.showNotification(title, options);
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/index.html';
  event.waitUntil(clients.openWindow(url));
});

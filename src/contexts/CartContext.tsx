import React, { createContext, useContext, useState, type ReactNode } from 'react';
import type { Product } from '../db/db';

export interface CartItem extends Product {
    quantity: number;
    batches?: any[];
}

interface CartContextType {
    cart: CartItem[];
    addToCart: (product: Product, currentStock: number) => boolean;
    removeFromCart: (productId: string) => void;
    updateQuantity: (productId: string, quantity: number, currentStock: number) => boolean;
    increaseQuantity: (productId: string, currentStock: number) => boolean;
    decreaseQuantity: (productId: string) => void;
    clearCart: () => void;
    cartTotal: number;
}

import { useAuth } from './AuthContext';

// ... (keep interface CartContextType)

const CartContext = createContext<CartContextType | undefined>(undefined);

const CartController: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();

    // Initialize cart from local storage based on user ID
    const [cart, setCart] = useState<CartItem[]>(() => {
        if (user?.id) {
            try {
                const saved = localStorage.getItem(`cart_${user.id}`);
                return saved ? JSON.parse(saved) : [];
            } catch (error) {
                console.error('Failed to parse cart from storage:', error);
                return [];
            }
        }
        return [];
    });

    // Save cart to local storage whenever it changes
    React.useEffect(() => {
        if (user?.id) {
            localStorage.setItem(`cart_${user.id}`, JSON.stringify(cart));
        }
    }, [cart, user?.id]);

    const addToCart = (product: Product, currentStock: number) => {
        let success = true;
        setCart(prev => {
            const existing = prev.find(p => p._id === product._id);
            if (existing) {
                if (existing.quantity + 1 > currentStock) {
                    success = false;
                    return prev;
                }
                return prev.map(p => p._id === product._id ? { ...p, quantity: p.quantity + 1 } : p);
            }
            if (currentStock <= 0) {
                success = false;
                return prev;
            }
            return [...prev, { ...product, quantity: 1 }];
        });
        return success;
    };

    const removeFromCart = (productId: string) => {
        setCart(prev => prev.filter(p => p._id !== productId));
    };

    const updateQuantity = (productId: string, quantity: number, currentStock: number) => {
        if (quantity <= 0) {
            removeFromCart(productId);
            return true;
        }
        if (quantity > currentStock) {
            return false;
        }
        setCart(prev => prev.map(p => p._id === productId ? { ...p, quantity } : p));
        return true;
    };

    const increaseQuantity = (productId: string, currentStock: number) => {
        let success = true;
        setCart(prev => {
            return prev.map(p => {
                if (p._id === productId) {
                    if (p.quantity + 1 > currentStock) {
                        success = false;
                        return p;
                    }
                    return { ...p, quantity: p.quantity + 1 };
                }
                return p;
            });
        });
        return success;
    };

    const decreaseQuantity = (productId: string) => {
        setCart(prev => prev.map(p =>
            p._id === productId ? { ...p, quantity: p.quantity - 1 } : p
        ).filter(p => p.quantity > 0));
    };

    const clearCart = () => setCart([]);

    const cartTotal = cart.reduce((sum, item) => {
        if (!item.batches || item.batches.length === 0) {
            return sum + (item.price * item.quantity);
        }

        const sortedBatches = [...item.batches].sort((a, b) => {
            if (a.expiryDate && b.expiryDate) {
                return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
            } else if (a.expiryDate) {
                return -1;
            } else if (b.expiryDate) {
                return 1;
            }
            return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        });

        let remainingQty = item.quantity;
        let itemTotal = 0;

        for (const batch of sortedBatches) {
            if (remainingQty <= 0) break;
            const useQty = Math.min(batch.quantityAvailable || 0, remainingQty);
            if (useQty <= 0) continue;

            const effectivePrice = batch.discountedPrice !== undefined ? batch.discountedPrice : item.price;
            itemTotal += effectivePrice * useQty;
            remainingQty -= useQty;
        }

        // Handle any remaining quantity not covered by batches (fallback to base price)
        if (remainingQty > 0) {
            itemTotal += item.price * remainingQty;
        }

        return sum + itemTotal;
    }, 0);

    return (
        <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, increaseQuantity, decreaseQuantity, clearCart, cartTotal }}>
            {children}
        </CartContext.Provider>
    );
};

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    // Using key forces re-mount and state re-initialization when user changes
    return <CartController key={user?.id || 'guest'}>{children}</CartController>;
};

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) throw new Error('useCart must be used within a CartProvider');
    return context;
};

import { Trash2 } from "lucide-react";
import { Product } from "../types";
import { formatINR } from "../utils/format";
import { GlassCard } from "@/components/ui/GlassCard";
import "../../components/collection-cards.css";

interface CartItemCardProps {
  product: Product;
  onRemove: (id: string) => void;
  onOpen?: (id: string) => void;
}

export default function CartItemCard({ product, onRemove, onOpen }: CartItemCardProps) {
  return (
    <GlassCard
      contentClassName="p-0"
      className="dc-collection-card dc-cart-card"
      data-cart-card={product.id}
    >
      <button
        type="button"
        onClick={() => onOpen?.(product.id)}
        className="dc-collection-media"
        aria-label={`View ${product.title}`}
      >
        <img src={product.image} alt={product.title} loading="lazy" decoding="async" />
      </button>
      <div className="dc-collection-body">
        <button type="button" onClick={() => onOpen?.(product.id)} className="dc-collection-link">
          <span className="dc-collection-category">{product.category}</span>
          <h3 className="dc-collection-title" title={product.title}>{product.title}</h3>
        </button>
        <p className="dc-collection-meta">{product.author}</p>
        <div className="dc-cart-footer">
          <div className="dc-collection-prices">
            <span className="dc-collection-price">{formatINR(product.price)}</span>
            {product.originalPrice > product.price && (
              <span className="line-through">{formatINR(product.originalPrice)}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(product.id)}
            className="dc-cart-remove"
            aria-label={`Remove ${product.title} from cart`}
            title="Remove item"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </GlassCard>
  );
}

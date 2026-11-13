export interface RealProduct {
  id: string; name: string; description: string; price: number; stock: number | null;
  active: boolean; imageId: string | null; imageUrl: string; revision: number; createdAt: string;
  listedBy: string; listedByName: string;
}
export interface RealVoucher {
  id: string; code: string; studentId: string; productId: string; name: string; price: number;
  imageId: string | null; imageUrl: string; purchasedAt: string; redeemedAt: string | null; redeemedBy: string | null;
  listedBy: string; listedByName: string;
}
export interface VoucherPage { vouchers: RealVoucher[]; nextCursor: string | null }

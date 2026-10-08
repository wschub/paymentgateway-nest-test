import { Injectable } from '@nestjs/common';
import type { Product as PrismaProduct } from '@prisma/client';
import { Product } from '../../domain/entities/product.entity';
import { DataAccessError } from '../../domain/errors/data-access.error';
import type { ProductRepository } from '../../domain/ports/product.repository';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Product[]> {
    try {
      const rows = await this.prisma.product.findMany({
        orderBy: { name: 'asc' },
      });

      return rows.map((row) => this.toDomain(row));
    } catch (error) {
      throw new DataAccessError('Unable to load the product catalog', {
        cause: error,
      });
    }
  }

  async findById(id: string): Promise<Product | null> {
    try {
      const row = await this.prisma.product.findUnique({ where: { id } });

      return row === null ? null : this.toDomain(row);
    } catch (error) {
      throw new DataAccessError('Unable to load the product', {
        cause: error,
      });
    }
  }

  private toDomain(row: PrismaProduct): Product {
    return new Product({
      id: row.id,
      name: row.name,
      description: row.description,
      priceInCents: row.priceInCents,
      stock: row.stock,
      imageUrl: row.imageUrl,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
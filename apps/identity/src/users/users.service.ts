import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { getAddress, isAddress } from 'viem';
import { UserRole } from '@app/common/constants';
import { User } from '../database/schema/users.schema';
import { USERS_ERROR_CODES, USERS_ERRORS, USERS_LOGS } from './users.constants';
import { UsersRepository } from './users.repository';

/**
 * Service managing user domain operations:
 * - EVM address checksum validation and normalization (EIP-55).
 * - User lookup and profile queries.
 * - Automatic user registration during authentication.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly usersRepository: UsersRepository) {}

  /**
   * Validates and converts an EVM address to EIP-55 Checksum format.
   *
   * @param address - Raw 42-character hex EVM address (e.g. `0x5aaeb6053f3e94c9...`)
   * @returns Checksum-cased address string (e.g. `0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed`)
   * @throws {BadRequestException} If the address format is invalid or malformed
   */
  normalizeAddress(address: string): string {
    if (!address || !isAddress(address)) {
      throw new BadRequestException({
        message: USERS_ERRORS.invalidWalletAddress(address),
        errorCode: USERS_ERROR_CODES.invalidWalletAddress,
      });
    }
    return getAddress(address);
  }

  /**
   * Retrieves a user by their unique identifier.
   *
   * @param id - Unique user identifier (UUIDv7 string)
   * @throws {NotFoundException} If no user exists with the given ID
   */
  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException({
        message: USERS_ERRORS.userNotFoundById(id),
        errorCode: USERS_ERROR_CODES.userNotFound,
      });
    }
    return user;
  }

  /**
   * Retrieves a user by their EVM wallet address.
   *
   * @param walletAddress - Raw or checksummed EVM address (automatically normalized to EIP-55)
   * @throws {NotFoundException} If no user exists with the given address
   */
  async findByAddress(walletAddress: string): Promise<User> {
    const normalized = this.normalizeAddress(walletAddress);
    const user = await this.usersRepository.findByWalletAddress(normalized);
    if (!user) {
      throw new NotFoundException({
        message: USERS_ERRORS.userNotFoundByAddress(normalized),
        errorCode: USERS_ERROR_CODES.userNotFound,
      });
    }
    return user;
  }

  /**
   * Looks up an existing user by wallet address or registers a new default trader profile.
   *
   * @param walletAddress - Raw or checksummed EVM address
   * @returns Object containing the user entity and an `isNew` boolean flag
   */
  async findOrCreate(walletAddress: string): Promise<{ user: User; isNew: boolean }> {
    const normalized = this.normalizeAddress(walletAddress);
    const result = await this.usersRepository.findOrCreateByWalletAddress(normalized);
    if (result.isNew) {
      this.logger.log(USERS_LOGS.userRegistered(normalized, result.user.id));
    }
    return result;
  }

  /**
   * Updates the role of an existing user.
   *
   * @param id - User UUID
   * @param role - Target role to assign
   * @throws {NotFoundException} If user does not exist
   */
  async updateRole(id: string, role: UserRole): Promise<User> {
    const user = await this.usersRepository.updateRole(id, role);
    if (!user) {
      throw new NotFoundException({
        message: USERS_ERRORS.userNotFoundById(id),
        errorCode: USERS_ERROR_CODES.userNotFound,
      });
    }
    return user;
  }
}

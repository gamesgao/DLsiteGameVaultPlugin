import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import type {
  GameVaultPluginModule,
  GameVaultPluginModuleMetadataV1,
} from "../../../src/globals.js";
import { MediaModule } from "../../../src/modules/media/media.module.js";
import { Media } from "../../../src/modules/media/media.entity.js";
import { MetadataModule } from "../../../src/modules/metadata/metadata.module.js";
import { DlsiteMetadataProviderService } from "./dlsite.metadata-provider.service.js";

@Module({
  imports: [MetadataModule, MediaModule, TypeOrmModule.forFeature([Media])],
  providers: [DlsiteMetadataProviderService],
})
export default class DlsitePluginModule implements GameVaultPluginModule {
  metadata: GameVaultPluginModuleMetadataV1 = {
    name: "DLsite",
    author: "gamesgao",
    version: "0.2.0",
    description: "ID-first DLsite metadata provider for GameVault.",
    license: "MIT",
    website: "https://github.com/gamesgao/DLsiteGameVaultPlugin",
    keywords: ["metadata", "dlsite"],
  };
}

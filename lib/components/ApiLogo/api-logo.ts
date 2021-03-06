'use strict';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { BaseComponent, SpecManager } from '../base';

@Component({
  selector: 'api-logo',
  styleUrls: ['./api-logo.css'],
  templateUrl: './api-logo.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ApiLogo extends BaseComponent {
  logo:any = {};

  constructor(specMgr:SpecManager) {
    super(specMgr);
  }

  init() {
    let logoInfo = this.componentSchema.info['x-logo'];
    if (!logoInfo) return;
    this.logo.imgUrl = logoInfo.url;
    this.logo.bgColor = logoInfo.backgroundColor || 'transparent';
  }
}

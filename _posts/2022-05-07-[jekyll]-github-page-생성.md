---
layout: distill
date: 2022-05-08
authors: 
  - name: wtoong
toc:
  - name : 시작
  - name : 테마
  - name : 추가
  - name : 후기
comments: true
categories: jekyll githubpage
---
## 시작

Github Page의 jekyll 기반 Post 작성!

<a href="https://www.google.com/search?q=jekyll+blog">`Github Page를 이용하여 jekyll 기반으로 Blog 생성하는 방법`</a>은 좋은 다른 가이드가 많아서 후기만 간단히 쓰겠다..

우선 WSL으로 설치한 Ubuntu-20.04LTS 에서 jekyll 을 설치했으며 설치 방법은 꼭 
<a href="https://jekyllrb.com/docs/installation/ubuntu/">`jekyll 설치가이드`</a>
를 따라야 한다. 특히 나같은 하수라면.. 하라는 대로 하는게 더 좋은것 같다!

## 테마

테마는 사실 뭘 쓸까 고민하다가 마음에 드는것을 하나 골라서 따라 만들어봤다.
다른 좋은 것들이 많으니 원하는 테마를 검색하여 fork 후 사용해도 되고 다른 가이드를 따라서 만들어도 상관없다.
나는 둘러보다 뭔가에 이끌리듯이 
<a href="https://github.com/alshedivat/al-folio">`al-folio`</a>
의 테마를 카피하여 만들었다.

al-folio 기반으로 세팅하면서 ImageMagick 관련 에러가 발생하는데 이건 ImageMagick을 설치하면 된다.
설치 과정에서 조금 고생을 했는데 ubuntu 터미널에서 `convert`를 치면 해당 명령어 관련 추천 리스트를 보여준다.
여기서 필요한 ImageMagick을 복사하여 실행하면 정상적으로 설치가 된다!
꼭 이 방법으로 설치하시길..

## 추가
왠지 블로그를 만들면 광고를 통해 수익을 챙길 수 있을것 같다는 느낌이 누구나 있지 않을까..?
사실 조그마한 월급의 티끌도 못미치는 수익이겠지만 없는 것보단 낫다고 생각하여 Google AdSense도 세팅했다!
이것도 
<a href="https://www.google.com/search?q=jekyll+adsense">`jekyll adsense`</a>
검색하면 다양한 정보가 나오기 때문에 따라하시면 된다!

마찬가지로 구글/네이버에 검색되도록 하려면 
<a href="https://www.google.com/search?q=jekyll+google+search">`jekyll google search`</a> 혹은
<a href="https://www.google.com/search?q=jekyll+naver+search">`jekyll naver search`</a>
를 검색하면 많은 고수분들의 자료가 있다!

## 후기

얼마나 열심히 이 블로그를 작성할지는 모르겠지만.. 이것 저것 세팅해보는 경험은 재밌었던것 같다!
아직 이 테마에 없는 검색엔진과 같은 부분은 차근차근 수정해 나가야지..
